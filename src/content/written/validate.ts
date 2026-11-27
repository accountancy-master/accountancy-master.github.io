import { OUTLINE } from '../outline.generated';
import { badRupees, practicalCourseOf, stringsOf } from '../practical/validate';
import type { WrittenQuestion } from './types';

// Checks on the board-style written answers: ids, topics and concepts that exist, a model answer of the right shape
// for its form, marks that divide into points, key words a learner's answer can match, and the house rules (no
// gendered pronoun, rupees in Indian grouping).

/** The fewest written questions each taught topic should have. */
export const WRITTEN_MIN_PER_TOPIC = 6;

const PRONOUN = /\b(he|she|him|her|his|hers|himself|herself)\b/i;
const COURSE_OF = { w11: 'cbse-11-accountancy', w12: 'cbse-12-accountancy' } as const;

export function validateWritten(questions: readonly WrittenQuestion[], prefix: 'w11' | 'w12'): string[] {
  const errors: string[] = [];
  const course = practicalCourseOf(COURSE_OF[prefix]);
  if (!course) return [`no course ${COURSE_OF[prefix]}`];
  const concepts = new Map(OUTLINE.topics.map((t) => [t.id, new Set(t.concepts.map(([id]) => id))]));
  const ids = new Set<string>();
  const prompts = new Set<string>();
  for (const q of questions) {
    const at = q.id;
    if (!new RegExp(`^${prefix}-[a-z0-9]+-[0-9]{3}$`).test(q.id)) errors.push(`${at}: an id should look like ${prefix}-<topic prefix>-001`);
    if (ids.has(q.id)) errors.push(`${at}: the id is used twice`);
    ids.add(q.id);
    const prompt = q.prompt.trim().toLowerCase();
    if (prompts.has(prompt)) errors.push(`${at}: the same prompt is asked twice`);
    prompts.add(prompt);
    if (!course.topics.includes(q.topicId)) errors.push(`${at}: ${q.topicId} is not a topic of ${course.id}`);
    else if (!concepts.get(q.topicId)?.has(q.conceptId)) errors.push(`${at}: ${q.conceptId} is not a concept of ${q.topicId}`);
    if (![1, 3, 4, 6].includes(q.marks)) errors.push(`${at}: marks should be 1, 3, 4 or 6`);
    if (!Number.isInteger(q.pointsNeeded) || q.pointsNeeded < 1) errors.push(`${at}: pointsNeeded should be a whole number from 1`);
    else {
      if (q.points.length < q.pointsNeeded) errors.push(`${at}: fewer points (${q.points.length}) than pointsNeeded (${q.pointsNeeded})`);
      if (!Number.isInteger((q.marks / q.pointsNeeded) * 2)) errors.push(`${at}: ${q.marks} marks do not split into halves over ${q.pointsNeeded} points`);
    }
    for (const [i, p] of q.points.entries()) {
      if (!p.text.trim()) errors.push(`${at}: point ${i + 1} has no text`);
      if (p.keywords.length === 0) errors.push(`${at}: point ${i + 1} has no key words`);
      for (const k of p.keywords) if (!k.trim() || k !== k.trim().toLowerCase()) errors.push(`${at}: key word "${k}" should be lower case and trimmed`);
    }
    if (q.form === 'distinguish') {
      if (!q.table) errors.push(`${at}: a "distinguish" question needs a table`);
      else {
        if (q.table.headers[0] !== 'Basis') errors.push(`${at}: the table's first heading should be "Basis"`);
        if (q.table.rows.length !== q.points.length) errors.push(`${at}: the table has ${q.table.rows.length} rows for ${q.points.length} points`);
        for (const [i, r] of q.table.rows.entries()) if (r.some((c) => !c.trim())) errors.push(`${at}: row ${i + 1} of the table has an empty cell`);
      }
    } else {
      if (!q.answer?.trim()) errors.push(`${at}: a "${q.form}" question needs a model answer`);
      if (q.table) errors.push(`${at}: only a "distinguish" question has a table`);
    }
    if (!q.markingTip.trim()) errors.push(`${at}: no marking tip`);
    if (q.hints.length !== 2 || q.hints.some((h) => !h.trim())) errors.push(`${at}: two hints are needed`);
    for (const text of stringsOf(q)) {
      if (PRONOUN.test(text)) errors.push(`${at}: a gendered pronoun in "${text.slice(0, 80)}"`);
      for (const bad of badRupees(text)) errors.push(`${at}: ${bad}`);
    }
  }
  return errors;
}

/** The taught topics of a class with fewer written questions than the minimum. */
export function thinTopics(questions: readonly WrittenQuestion[], prefix: 'w11' | 'w12'): string[] {
  const course = practicalCourseOf(COURSE_OF[prefix]);
  if (!course) return [];
  return course.taught.filter((t) => questions.filter((q) => q.topicId === t).length < WRITTEN_MIN_PER_TOPIC);
}
