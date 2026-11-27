import { isKebab, sentenceCount } from '../glossary/validate';
import { findCourse } from '../outline';
import { PROJECT_TOPIC, type PracticalCourse } from './types';

// Checks the project work of a course (types.ts) against what the course has, and against the house rules: every
// topic of the course has viva questions, every question is the right shape, no text uses a gendered pronoun, every
// amount in rupees has Indian digit grouping, and nothing of Class 11 asks for interest on drawings (outside the
// 2025-26 syllabus). Run by `npm run validate-content` and by a unit test. The figures are checked by figures.test.ts.

/** What the checks need to know of a course. */
export interface PracticalCourseInfo {
  id: string;
  /** Every topic of the course. */
  topics: string[];
  /** The topics a viva must cover: all but those of exam preparation (mixed cases, mock exams). */
  taught: string[];
}

/** The course as the app's outline knows it, or undefined for a course that does not exist. */
export function practicalCourseOf(courseId: string): PracticalCourseInfo | undefined {
  const course = findCourse(courseId);
  if (!course) return undefined;
  return { id: course.id, topics: course.topics.map((t) => t.id), taught: course.topics.filter((t) => t.unit !== 'Exam Preparation').map((t) => t.id) };
}

/** The least a viva bank holds, in all and for each taught topic and each project option. */
export const VIVA_MIN = { total: 200, perTopic: 5, perOption: 10, project: 20 };

/** Every string inside a value, however deep. */
export function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}

const PRONOUN = /\b(he|she|him|her|his|hers|himself|herself)\b/i;

/** The amounts in rupees of a text that are not grouped the Indian way (₹1,25,000; not ₹125,000 or ₹125000). */
export function badRupees(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/₹\s?(\d[\d,]*)/g)) {
    const whole = m[1].replace(/,+$/, '');
    if (!/^\d{1,3}$|^\d{1,2}(,\d{2})*,\d{3}$/.test(whole)) out.push(`₹${whole}`);
  }
  return out;
}

/** What is wrong with the project work of a course: one message per problem, none when it is right. */
export function validatePractical(practical: PracticalCourse, course: PracticalCourseInfo): string[] {
  const errors: string[] = [];
  const at = `practical ${course.id}`;
  if (practical.courseId !== course.id) errors.push(`${at}: the project work is of ${practical.courseId}`);
  const topics = new Set(course.topics);
  const marks = practical.marks.reduce((n, m) => n + m.marks, 0);
  if (marks !== 20) errors.push(`${at}: the marks add up to ${marks}, not 20`);

  // The options.
  const optionIds = new Set<string>();
  for (const [i, o] of practical.options.entries()) {
    const where = `${at}: option ${o.id || '(no id)'}`;
    if (!isKebab(o.id)) errors.push(`${where}: the id must be kebab-case`);
    if (optionIds.has(o.id)) errors.push(`${where}: duplicate id`);
    optionIds.add(o.id);
    if (o.number !== i + 1) errors.push(`${where}: is number ${o.number}, but comes ${i + 1}`);
    if (!o.title.trim() || !o.short.trim() || !o.summary.trim() || !o.when.trim()) errors.push(`${where}: a title, short name, summary or "when" is empty`);
    if (o.fileSections.length < 5) errors.push(`${where}: the file has fewer than five sections`);
    if (o.fileSections[0]?.title !== 'Certificate') errors.push(`${where}: the file must open with the certificate`);
    if (o.plan.length < 4) errors.push(`${where}: the plan has fewer than four steps`);
    if (o.mistakes.length < 4) errors.push(`${where}: fewer than four common mistakes`);
    for (const t of o.topicIds) if (!topics.has(t)) errors.push(`${where}: ${t} is not a topic of ${course.id}`);
    if (o.aspects && o.aspects.length < 2) errors.push(`${where}: a choice of aspects needs at least two`);
  }

  // The viva bank.
  const ids = new Set<string>();
  const questions = new Set<string>();
  const perTopic = new Map<string, number>();
  const perOption = new Map<string, number>();
  const prefix = course.id === 'cbse-11-accountancy' ? 'v11' : course.id === 'cbse-12-accountancy' ? 'v12' : 'v';
  for (const q of practical.viva) {
    const where = `${at}: viva ${q.id || '(no id)'}`;
    if (!new RegExp(`^${prefix}-\\d{3}$`).test(q.id)) errors.push(`${where}: the id must be ${prefix}-NNN`);
    if (ids.has(q.id)) errors.push(`${where}: duplicate id`);
    ids.add(q.id);
    const key = q.question.trim().toLowerCase();
    if (questions.has(key)) errors.push(`${where}: the question is asked twice`);
    questions.add(key);
    if (!q.question.trim().endsWith('?')) errors.push(`${where}: the question must end with a question mark`);
    const n = sentenceCount(q.answer ?? '');
    if (n < 1 || n > 3) errors.push(`${where}: the answer must be one to three sentences (it has ${n})`);
    if (q.topicId !== PROJECT_TOPIC && !topics.has(q.topicId)) errors.push(`${where}: ${q.topicId} is not a topic of ${course.id}`);
    perTopic.set(q.topicId, (perTopic.get(q.topicId) ?? 0) + 1);
    if (q.options.length === 0) errors.push(`${where}: suits no project option`);
    if (new Set(q.options).size !== q.options.length) errors.push(`${where}: an option is listed twice`);
    for (const o of q.options) {
      if (!optionIds.has(o)) errors.push(`${where}: ${o} is not a project option of ${course.id}`);
      perOption.set(o, (perOption.get(o) ?? 0) + 1);
    }
    if (!['easy', 'medium', 'complex'].includes(q.difficulty)) errors.push(`${where}: the difficulty ${q.difficulty} is not easy, medium or complex`);
  }
  if (practical.viva.length < VIVA_MIN.total) errors.push(`${at}: the viva bank has ${practical.viva.length} questions, fewer than ${VIVA_MIN.total}`);
  for (const t of course.taught) {
    const count = perTopic.get(t) ?? 0;
    if (count < VIVA_MIN.perTopic) errors.push(`${at}: the viva bank has ${count} questions on ${t}, fewer than ${VIVA_MIN.perTopic}`);
  }
  if ((perTopic.get(PROJECT_TOPIC) ?? 0) < VIVA_MIN.project) errors.push(`${at}: fewer than ${VIVA_MIN.project} viva questions on the project itself`);
  for (const o of optionIds) {
    const count = perOption.get(o) ?? 0;
    if (count < VIVA_MIN.perOption) errors.push(`${at}: the viva bank has ${count} questions for option ${o}, fewer than ${VIVA_MIN.perOption}`);
  }

  // The house rules, over every text.
  for (const text of stringsOf(practical)) {
    if (PRONOUN.test(text)) errors.push(`${at}: a gendered pronoun in "${text.slice(0, 80)}"`);
    for (const bad of badRupees(text)) errors.push(`${at}: ${bad} is not grouped the Indian way, in "${text.slice(0, 80)}"`);
    if (course.id === 'cbse-11-accountancy' && /interest on drawings/i.test(text)) errors.push(`${at}: interest on drawings is outside the 2025-26 Class 11 syllabus: "${text.slice(0, 80)}"`);
  }
  return errors;
}
