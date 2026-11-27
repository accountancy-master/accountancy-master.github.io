import type { StageOutline } from '@/content/outline';
import type { Question, QuestionOutline, TopicOutline } from '@/content/types';
import { createRng } from '@/engine/rng';
import { parseCasePartId, parseGenId } from '@/generators/ids';
import { generateCaseQuestions } from '@/generators/loaded';
import { isLongKind, type CaseOutline } from '@/generators/types';
import { CONFIG } from './config';
import {
  MARATHON_ALL,
  atDifficulty,
  isMarathonDifficulty,
  marathonDifficulty,
  nextMarathonQuestion,
  poolIsEmpty,
  type MarathonDifficulty,
  type MarathonInput,
  type MarathonPool,
} from './marathon';
import { SUBTOPICS_PARAM, subtopicsFromQuery } from './marathonSubtopics';
import { listOf, type QueryLike } from './patterns';

// ---------------------------------------------------------------------------------------------------------------
// A marathon of chosen topics: the learner ticks topics across the course and the kinds of question to mix (quick
// questions, long ones, case studies), and the questions of all of them come mixed until the learner stops. The run
// is at `/practice/marathon/mix?topics=a,b&kinds=quick,cases&level=easy&subtopics=x,y`. A run at a topic's own
// address (`/practice/marathon/<topicId>`, `/practice/marathon/all`) is the marathon it has always been.
// ---------------------------------------------------------------------------------------------------------------

/** The route segment of a run over chosen topics. */
export const MARATHON_MIX = 'mix';

/** Quick questions (choices, figures, single entries), long ones (sets of entries and formats), and case studies. */
export const MIX_KINDS = ['quick', 'long', 'cases'] as const;
export type MixKind = (typeof MIX_KINDS)[number];

export const MIX_KIND_LABEL: Record<MixKind, string> = { quick: 'Quick questions', long: 'Long questions', cases: 'Case studies' };

/** What a run of chosen topics mixes when its address names no kinds: quick questions. */
export const DEFAULT_MIX_KINDS: readonly MixKind[] = ['quick'];

/** What a run at a topic's own address mixes when it names no kinds: every question of the topic, as it always has. */
export const LEGACY_MIX_KINDS: readonly MixKind[] = ['quick', 'long'];

const LONG_TYPES: readonly Question['type'][] = ['journal_set', 'account', 'statement'];
const isLongType = (type: Question['type']): boolean => LONG_TYPES.includes(type);

/** The pool with only the kinds asked for: quick questions, long ones, or both. Case studies are not in a pool. */
export function withKinds<Q extends QuestionOutline, P extends MarathonPool<Q>>(pool: P, kinds: readonly MixKind[]): P {
  const quick = kinds.includes('quick');
  const long = kinds.includes('long');
  if (quick && long) return pool;
  return {
    ...pool,
    templates: pool.templates.filter((t) => (isLongKind(t.kind) ? long : quick)),
    questions: pool.questions.filter((q) => (isLongType(q.type) ? long : quick)),
  };
}

/**
 * The case studies a run over these topics may serve: those of every stage whose topic is one of them (the topic
 * whose ladder the stage ends), and of those only the stages `open` lets through. Every case makes a new case for
 * every seed.
 */
export function casesOfTopics<S extends Pick<StageOutline, 'topicId' | 'cases'>>(stages: readonly S[], topicIds: readonly string[], open: (stage: S) => boolean = () => true): S['cases'] {
  const chosen = new Set(topicIds);
  return stages.filter((s) => chosen.has(s.topicId) && open(s)).flatMap((s) => s.cases);
}

/**
 * The pool of a run that keeps some topics to some of their subtopics: a topic with any of its concepts among
 * `conceptIds` keeps those alone; a topic with none of them is left whole. Null leaves the pool as it is.
 */
export function narrowByTopic<Q extends QuestionOutline, P extends MarathonPool<Q>>(pool: P, conceptIds: readonly string[] | null, packs: readonly Pick<TopicOutline, 'concepts'>[]): P {
  if (conceptIds === null) return pool;
  const named = new Set(conceptIds);
  const dropped = new Set<string>();
  for (const pack of packs) {
    if (!pack.concepts.some((c) => named.has(c.id))) continue;
    for (const c of pack.concepts) if (!named.has(c.id)) dropped.add(c.id);
  }
  if (dropped.size === 0) return pool;
  return { ...pool, templates: pool.templates.filter((t) => !dropped.has(t.conceptId)), questions: pool.questions.filter((q) => !dropped.has(q.conceptId)) };
}

// ---------------------------------------------------------------------------------------------------------------
// Choosing what comes next.
// ---------------------------------------------------------------------------------------------------------------

/** What a run over chosen topics may serve: the questions of a marathon pool, and whole case studies. */
export interface MixPool extends MarathonPool {
  cases: CaseOutline[];
}

export interface MixInput extends Omit<MarathonInput, 'pool'> {
  pool: MixPool;
}

// Keeps the stream that chooses a case apart from the streams that choose a question and make it.
const CASE_SALT = 0x1b873593;

const caseIdOf = (q: Pick<Question, 'id'>): string | undefined => parseCasePartId(parseGenId(q.id)?.templateId ?? '')?.caseId;

export const mixIsEmpty = (pool: MixPool, difficulty: MarathonDifficulty): boolean =>
  poolIsEmpty(pool, difficulty) && casesAt(pool.cases, difficulty, []).length === 0;

/** The cases of the difficulty a run wants now: the one chosen, or in a mixed run the nearest the answers call for. */
function casesAt(cases: readonly CaseOutline[], difficulty: MarathonDifficulty, answers: MarathonInput['answers']): CaseOutline[] {
  const strict = difficulty !== 'mixed';
  return atDifficulty(cases, strict ? difficulty : marathonDifficulty(answers), strict);
}

/** A whole case: of the cases at the difficulty, one of those this run has served least, never the last one when there is another. */
function nextCase(input: MixInput): Question[] {
  const { pool, seed, difficulty, served, answers } = input;
  const cases = casesAt(pool.cases, difficulty, answers);
  if (cases.length === 0) return [];
  const starts = new Map<string, number>();
  let last: string | undefined;
  for (const q of served) {
    const id = caseIdOf(q);
    if (id === undefined) continue;
    if (id !== last) starts.set(id, (starts.get(id) ?? 0) + 1);
    last = id;
  }
  const others = cases.filter((c) => c.id !== last);
  const from = others.length > 0 ? others : cases;
  const least = Math.min(...from.map((c) => starts.get(c.id) ?? 0));
  const position = served.length;
  const chosen = createRng((seed + position) ^ CASE_SALT).pick(from.filter((c) => (starts.get(c.id) ?? 0) === least));
  return generateCaseQuestions(chosen.id, seed + position);
}

/**
 * What comes at the next position of a run: one question, chosen as any marathon chooses it (leaning towards the
 * concepts the learner is weakest in, see `nextMarathonQuestion`), or every question of a case study, in order, all
 * made from the seed of that position. A case comes after every `caseEvery` other questions, and every time when the
 * run has nothing but cases. Empty when nothing is left to serve.
 */
export function nextMixQuestions(input: MixInput): Question[] {
  const { pool, served, difficulty } = input;
  const hasCases = casesAt(pool.cases, difficulty, input.answers).length > 0;
  let since = 0;
  for (let i = served.length - 1; i >= 0 && caseIdOf(served[i]) === undefined; i--) since++;
  if (hasCases && (poolIsEmpty(pool, difficulty) || since >= CONFIG.marathon.caseEvery)) return nextCase(input);
  const question = nextMarathonQuestion({ ...input, pool });
  if (question) return [question];
  return hasCases ? nextCase(input) : [];
}

/** The next questions of a run, at least `count` of them while there are any (a case is never cut). */
export function mixBatch(input: MixInput, count: number = CONFIG.marathon.batch): Question[] {
  const batch: Question[] = [];
  while (batch.length < count) {
    const next = nextMixQuestions({ ...input, served: [...input.served, ...batch] });
    if (next.length === 0) break;
    batch.push(...next);
  }
  return batch;
}

// ---------------------------------------------------------------------------------------------------------------
// The address of a run, and of the Marathon screen set up for it.
// ---------------------------------------------------------------------------------------------------------------

export interface MarathonSetup {
  /** The topics chosen; null when the address names none. */
  topics: string[] | null;
  kinds: MixKind[];
  difficulty: MarathonDifficulty;
  /** Concept ids that keep their topics to them (see `narrowByTopic`); null for whole topics. */
  subtopics: string[] | null;
  /** True when the run includes practice beyond the syllabus (see `marathonPool`). Off unless the address says so. */
  beyond?: boolean;
}

/** The address says a run includes practice beyond the syllabus with `beyond=1`. */
export const BEYOND_PARAM = 'beyond';

/** Whether an address asks for practice beyond the syllabus. */
export const beyondFromQuery = (query: QueryLike): boolean => query.get(BEYOND_PARAM) === '1';

export function setupFromQuery(query: QueryLike, defaultKinds: readonly MixKind[] = DEFAULT_MIX_KINDS): MarathonSetup {
  const topics = query.get('topics');
  const kinds = query.get('kinds');
  const level = query.get('level');
  const asked = new Set(listOf(kinds));
  return {
    topics: topics === null ? null : listOf(topics),
    kinds: kinds === null ? [...defaultKinds] : MIX_KINDS.filter((k) => asked.has(k)),
    difficulty: isMarathonDifficulty(level) ? level : 'mixed',
    subtopics: subtopicsFromQuery(query.get(SUBTOPICS_PARAM)),
    beyond: beyondFromQuery(query),
  };
}

/** The query string (no `?`) of a setup, commas left as they are; the kinds are left out when they are the default. */
export function setupToQuery(setup: MarathonSetup): string {
  const kinds = MIX_KINDS.filter((k) => setup.kinds.includes(k));
  const isDefault = kinds.length === DEFAULT_MIX_KINDS.length && kinds.every((k) => DEFAULT_MIX_KINDS.includes(k));
  return [
    setup.topics === null ? '' : `topics=${setup.topics.map(encodeURIComponent).join(',')}`,
    isDefault ? '' : `kinds=${kinds.join(',')}`,
    setup.difficulty === 'mixed' ? '' : `level=${setup.difficulty}`,
    setup.subtopics === null || setup.subtopics.length === 0 ? '' : `${SUBTOPICS_PARAM}=${setup.subtopics.map(encodeURIComponent).join(',')}`,
    setup.beyond ? `${BEYOND_PARAM}=1` : '',
  ]
    .filter(Boolean)
    .join('&');
}

/** Where a run over chosen topics is played. */
export const mixHref = (setup: MarathonSetup): string => {
  const q = setupToQuery(setup);
  return `/practice/marathon/${MARATHON_MIX}${q ? `?${q}` : ''}`;
};

/** The scope a run is recorded under: its topic when it had one, else all the topics (as a run left unstopped is). */
export const recordScope = (topicIds: readonly string[]): string => (topicIds.length === 1 ? topicIds[0] : MARATHON_ALL);

// ---------------------------------------------------------------------------------------------------------------
// What is said about a choice and a run.
// ---------------------------------------------------------------------------------------------------------------

const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/** "12 topics · 340 patterns · 18 case studies"; the cases are left out when there are none. */
export function mixSummaryLine(choice: { topics: number; patterns: number; cases: number }): string {
  if (choice.topics === 0) return 'No topic chosen';
  return [count(choice.topics, 'topic', 'topics'), count(choice.patterns, 'question type', 'question types'), ...(choice.cases > 0 ? [count(choice.cases, 'case study', 'case studies')] : [])].join(' · ');
}

export type AnswerKind = 'quick' | 'long' | 'case';

export const ANSWER_KIND_LABEL: Record<AnswerKind, string> = { quick: 'Quick questions', long: 'Long questions', case: 'Case studies' };

/** What kind of question this was: a question of a case, a long one, or a quick one. */
export const answerKindOf = (q: Pick<Question, 'type' | 'context'>): AnswerKind => (q.context !== undefined ? 'case' : isLongType(q.type) ? 'long' : 'quick');

export interface GroupAccuracy {
  key: string;
  answered: number;
  correct: number;
}

/** The answers counted by a key of their question (a topic, a kind), in the order the keys first came up. Unknown questions are left out. */
export function accuracyBy(answers: readonly { questionId: string; correct: boolean }[], keyOf: (questionId: string) => string | undefined): GroupAccuracy[] {
  const out: GroupAccuracy[] = [];
  for (const a of answers) {
    const key = keyOf(a.questionId);
    if (key === undefined) continue;
    let row = out.find((r) => r.key === key);
    if (!row) out.push((row = { key, answered: 0, correct: 0 }));
    row.answered++;
    if (a.correct) row.correct++;
  }
  return out;
}
