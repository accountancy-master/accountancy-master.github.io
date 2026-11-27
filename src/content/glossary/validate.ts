import { PART_B_CHOICES } from '@/content/courseOptions';
import { blueprintsOf } from '@/learning/paperBlueprints';
import { findCourse, findOutline } from '../outline';
import type { ExamTips, GlossaryEntry } from './types';

// Checks the glossary and the exam tips of a course (types.ts) against what the course has: its topics, their
// concepts and the sections of its full paper. Run by `npm run validate-content` and by a unit test.

/** What the checks need to know of a course. */
export interface GlossaryCourse {
  id: string;
  /** Every topic of the course catalogue, with the ids of its concepts (none for a topic that cannot be played yet). */
  topics: { id: string; concepts: string[] }[];
  /** The titles of the sections of the course's full paper, and its parts ("Part A"). */
  sections: string[];
}

/** The course as the app's outline knows it, or undefined for a course that does not exist. */
export function glossaryCourseOf(courseId: string): GlossaryCourse | undefined {
  const course = findCourse(courseId);
  if (!course) return undefined;
  // The sections of the full paper of every choice of Part B (Class 12 has two: content/courseOptions.ts).
  const full = PART_B_CHOICES.flatMap((partB) => blueprintsOf(courseId, { class12PartB: partB }).full.sections);
  return {
    id: course.id,
    topics: course.topics.map((t) => ({ id: t.id, concepts: (findOutline(t.id)?.concepts ?? []).map((c) => c.id) })),
    sections: [...new Set([...full.map((s) => s.title), ...full.flatMap((s) => (s.part ? [`Part ${s.part}`] : []))])],
  };
}

// Words whose full stop does not end a sentence when more of it follows ("e.g. Cash", "Rao & Co. Ltd").
const ABBREVIATION = /(?:^|[\s(])(?:e\.g|i\.e|viz|etc|vs|Co|Ltd|No|Nos|Rs|Mr|Mrs|Ms|Pvt|approx|p\.a)$/;

/**
 * How many sentences a text has: each ends with ".", "?" or "!" at the end of the text, or before a space and a
 * capital letter, a figure or "₹". The stop of a decimal figure or of an abbreviation followed by more text is not one.
 */
export function sentenceCount(text: string): number {
  const t = text.trim();
  let n = 0;
  for (const m of t.matchAll(/[.?!]["')\]]*(?=$|\s+["'(]?[A-Z0-9₹])/g)) {
    const end = m.index + m[0].length === t.length;
    if (!end && m[0][0] === '.' && ABBREVIATION.test(t.slice(0, m.index))) continue;
    n++;
  }
  return n;
}

/** True for an id in kebab-case: lower-case letters and digits in words joined by single hyphens. */
export const isKebab = (id: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);

/** A term as it is compared for "defined twice": lower case, spaces closed up. */
const termKey = (term: string): string => term.toLowerCase().replace(/\s+/g, ' ').trim();

/** What is wrong with the glossary of a course: one message per problem, none when it is right. */
export function validateGlossary(entries: readonly GlossaryEntry[], course: GlossaryCourse): string[] {
  const errors: string[] = [];
  const topics = new Map(course.topics.map((t) => [t.id, new Set(t.concepts)]));
  const ids = new Set<string>();
  const terms = new Map<string, string>();
  for (const e of entries) {
    const at = `glossary ${course.id}: ${e.id || '(no id)'}`;
    if (!e.id || !isKebab(e.id)) errors.push(`${at}: the id must be kebab-case (the term in lower case, words joined by hyphens)`);
    if (ids.has(e.id)) errors.push(`${at}: duplicate id`);
    ids.add(e.id);
    if (!e.term || e.term.trim() === '') errors.push(`${at}: has no term`);
    else {
      // A term may not be defined twice, under its own name or as another name of a term.
      for (const name of [e.term, ...(e.also ?? [])]) {
        const key = termKey(name);
        const other = terms.get(key);
        if (other !== undefined && other !== e.id) errors.push(`${at}: "${name}" is already defined by ${other}`);
        terms.set(key, e.id);
      }
    }
    if ((e.also ?? []).some((a) => a.trim() === '')) errors.push(`${at}: an other name is empty`);
    const n = sentenceCount(e.definition ?? '');
    if (!e.definition || e.definition.trim() === '') errors.push(`${at}: has no definition`);
    else if (n < 1 || n > 3) errors.push(`${at}: the definition must be one to three sentences, each ending with a full stop (it has ${n})`);
    if (e.example !== undefined && e.example.trim() === '') errors.push(`${at}: the example is empty`);
    const concepts = topics.get(e.topicId);
    if (!concepts) errors.push(`${at}: ${e.topicId} is not a topic of ${course.id}`);
    else if (e.conceptId !== undefined && !concepts.has(e.conceptId)) errors.push(`${at}: ${e.conceptId} is not a concept of ${e.topicId}`);
  }
  for (const e of entries) {
    for (const id of e.seeAlso ?? []) {
      if (!ids.has(id)) errors.push(`glossary ${course.id}: ${e.id}: see also ${id} is not an entry`);
      else if (id === e.id) errors.push(`glossary ${course.id}: ${e.id}: sees also itself`);
    }
    if (new Set(e.seeAlso ?? []).size !== (e.seeAlso ?? []).length) errors.push(`glossary ${course.id}: ${e.id}: see also repeats an id`);
  }
  return errors;
}

/** What is wrong with the exam tips of a course: one message per problem, none when they are right. */
export function validateTips(tips: ExamTips, course: GlossaryCourse): string[] {
  const errors: string[] = [];
  const at = `tips ${course.id}`;
  if (tips.courseId !== course.id) errors.push(`${at}: the tips are of ${tips.courseId}`);
  const texts = [...tips.general, ...tips.sections.flatMap((s) => s.tips), ...tips.mistakes.map((m) => m.text)];
  if (texts.some((t) => t.trim() === '')) errors.push(`${at}: a tip is empty`);
  const seen = new Set<string>();
  for (const t of texts) {
    if (seen.has(t.trim())) errors.push(`${at}: "${t}" is given twice`);
    seen.add(t.trim());
  }
  const sections = new Set(course.sections);
  for (const s of tips.sections) {
    if (!sections.has(s.title)) errors.push(`${at}: section "${s.title}" is not a section of the paper (${course.sections.join(', ')})`);
    if (s.tips.length === 0) errors.push(`${at}: section "${s.title}" has no tips`);
  }
  if (new Set(tips.sections.map((s) => `${s.title}|${s.partB ?? ''}`)).size !== tips.sections.length) errors.push(`${at}: a section is given twice`);
  const topics = new Set(course.topics.map((t) => t.id));
  for (const m of tips.mistakes) if (!topics.has(m.topicId)) errors.push(`${at}: ${m.topicId} is not a topic of ${course.id}`);
  return errors;
}
