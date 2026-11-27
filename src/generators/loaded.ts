import { findCaseOutline, findTemplateOutline } from '@/content/outline';
import type { Question } from '@/content/types';
import { generateCase, generateFrom } from './engine';
import { isValidSeed, parseCasePartId } from './ids';
import type { CaseTemplate, Template } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The generators that are in memory. A topic's templates and the cases of the stages it closes are registered when
// the topic is loaded (content/loadTopics.ts; all of them at once by ./index, for tests and scripts), and from then on
// a question is made from a template id and a seed exactly as before. Asking for a template whose topic has not been loaded is
// a mistake of the caller, and throws: nothing here ever answers for content that is not there.
// ---------------------------------------------------------------------------------------------------------------

const templates = new Map<string, Template>();
const cases = new Map<string, CaseTemplate>();

/** Makes templates available. Registering a template again changes nothing. */
export function registerTemplates(list: readonly Template[]): void {
  for (const t of list) templates.set(t.id, t);
}

/** Makes case studies available, and the template of each of their questions (`<caseId>~<n>`). */
export function registerCases(list: readonly CaseTemplate[]): void {
  for (const c of list) {
    cases.set(c.id, c);
    registerTemplates(c.parts);
  }
}

/** The error for a template or case that exists (the outline knows it) while its topic has not been loaded. */
function notLoaded(what: string, topicId: string): Error {
  return new Error(`${what} is not loaded: load topic ${topicId} first (see content/loadTopics.ts)`);
}

/** The template with this id. Throws for one that does not exist, and for one whose topic has not been loaded. */
export function getTemplate(id: string): Template {
  const t = templates.get(id);
  if (t) return t;
  const known = findTemplateOutline(id);
  throw known ? notLoaded(`Template ${id}`, known.topicId) : new Error(`Unknown template: ${id}`);
}

/**
 * The question a template makes for a seed. A seed the template rejects steps to the next one, so the id of the
 * question returned (`gen:<template>:<version>:<seed>`) names the seed that worked and regenerates the same question.
 */
export function generateQuestion(templateId: string, seed: number): Question {
  if (!isValidSeed(seed)) throw new Error(`Invalid seed: ${seed}`);
  // A question of a case comes from the case as a whole, so that every question of one seed shares its scenario.
  const part = parseCasePartId(templateId);
  if (part) {
    const question = generateCaseQuestions(part.caseId, seed)[part.index];
    if (!question) throw new Error(`Unknown template: ${templateId}`);
    return question;
  }
  return generateFrom(getTemplate(templateId), seed);
}

// The questions of a case are asked one after another and each is looked up by its own id, so the last few cases
// generated are kept instead of being set up again for every question.
const CASE_CACHE_MAX = 20;
const caseCache = new Map<string, Question[]>();

/** Every question of a case study for a seed, in the order they are asked. Throws for an unknown case. */
export function generateCaseQuestions(caseId: string, seed: number): Question[] {
  const c = cases.get(caseId);
  if (!c) {
    const known = findCaseOutline(caseId);
    throw known ? notLoaded(`Case ${caseId}`, known.topicId) : new Error(`Unknown case: ${caseId}`);
  }
  const key = `${caseId}:${seed}`;
  let questions = caseCache.get(key);
  if (!questions) {
    questions = generateCase(c, seed);
    if (caseCache.size >= CASE_CACHE_MAX) caseCache.clear();
    caseCache.set(key, questions);
  }
  return questions;
}
