import { templatesForConcept } from '@/content/outline';
import type { Difficulty, Question, QuestionOutline, TopicOutline } from '@/content/types';
import { createRng, type Rng } from '@/engine/rng';
import { parseGenId } from '@/generators/ids';
import { generateQuestion } from '@/generators/loaded';
import type { TemplateOutline } from '@/generators/types';
import { CONFIG } from './config';
import type { Available } from './practice';

// ---------------------------------------------------------------------------------------------------------------
// Marathon: questions on one topic (or on every topic the learner has played) until the learner stops. Nothing is
// built ahead of the learner but the next few questions, and each is chosen from what has been answered so far.
// ---------------------------------------------------------------------------------------------------------------

/** The route segment (`/practice/marathon/all`) and the scope of a run over every topic the learner has played. */
export const MARATHON_ALL = 'all';

export const MARATHON_DIFFICULTIES = ['mixed', 'easy', 'medium', 'complex'] as const;
/** `mixed` adapts to the learner; the others keep to one difficulty. */
export type MarathonDifficulty = (typeof MARATHON_DIFFICULTIES)[number];

export const isMarathonDifficulty = (s: string | null | undefined): s is MarathonDifficulty =>
  (MARATHON_DIFFICULTIES as readonly string[]).includes(s ?? '');

const LADDER: readonly Difficulty[] = ['easy', 'medium', 'complex'];

// ---------------------------------------------------------------------------------------------------------------
// Seeds. Levels, practice sessions, the daily challenge and mock papers stay below 3,500,000,000 (see practice.ts and
// mockPaper.ts). A marathon run owns a block of 10,000 seeds above that, one seed for each position in the run.
// ---------------------------------------------------------------------------------------------------------------

export const MARATHON_SEED_BASE = 3_500_000_000;
export const SEEDS_PER_RUN = 10_000;
/** Seeds stay inside 32 bits, where each still gives a stream of its own. */
export const MAX_MARATHON_RUNS = Math.floor((2 ** 32 - MARATHON_SEED_BASE) / SEEDS_PER_RUN);
// Keeps the stream that chooses a question apart from the stream of the question itself.
const CHOICE_SALT = 0x51ed270b;

/** The first seed of a run: each run started (stopped or not) gets the next block. */
export function marathonSeed(playCount: number): number {
  if (!Number.isInteger(playCount) || playCount < 0 || playCount >= MAX_MARATHON_RUNS) throw new Error('Invalid marathon play count');
  return MARATHON_SEED_BASE + playCount * SEEDS_PER_RUN;
}

// ---------------------------------------------------------------------------------------------------------------
// What a run may serve.
// ---------------------------------------------------------------------------------------------------------------

export interface MarathonPool<Q extends QuestionOutline = Question> {
  /** The available templates of the packs' concepts. A part of a case study is never among them. */
  templates: TemplateOutline[];
  /** The available authored questions of the packs (in outline, for a pool that is only counted). */
  questions: Q[];
}

/**
 * What a marathon over these packs may serve: the templates and authored questions of theirs that practice may serve
 * this learner (see `availableForLearner`, which also applies "unlock all levels"). Case studies are played whole and
 * elsewhere: their questions are in no pack and their parts are no templates of a concept.
 *
 * What teaches beyond the syllabus stands on no level, so it is never available: with `beyondSyllabus` (the learner
 * turned "Include beyond-syllabus practice" on) every such template and authored question of the packs joins the
 * pool, and without it none does.
 */
export function marathonPool<Q extends QuestionOutline>(
  packs: readonly (Pick<TopicOutline, 'concepts'> & { questions: Q[] })[],
  available: Available,
  beyondSyllabus = false,
): MarathonPool<Q> {
  const seen = new Set<string>();
  const templates: TemplateOutline[] = [];
  const wanted = (item: { id: string; beyondSyllabus?: string }, ids: ReadonlySet<string>) => (item.beyondSyllabus === undefined ? ids.has(item.id) : beyondSyllabus);
  for (const pack of packs) {
    for (const concept of pack.concepts) {
      for (const t of templatesForConcept(concept.id)) {
        if (wanted(t, available.templateIds) && !seen.has(t.id) && seen.add(t.id)) templates.push(t);
      }
    }
  }
  const questions = packs.flatMap((p) => p.questions).filter((q) => wanted(q, available.questionIds) && q.context === undefined);
  return { templates, questions };
}

export const poolIsEmpty = (pool: MarathonPool<QuestionOutline>, difficulty: MarathonDifficulty): boolean =>
  difficulty === 'mixed'
    ? pool.templates.length + pool.questions.length === 0
    : !pool.templates.some((t) => t.difficulty === difficulty) && !pool.questions.some((q) => q.difficulty === difficulty);

// ---------------------------------------------------------------------------------------------------------------
// Choosing the next question.
// ---------------------------------------------------------------------------------------------------------------

/** What an answer of the run says for the choice of what comes next. */
export interface MarathonAnswer {
  conceptId: string;
  correct: boolean;
}

/**
 * How hard the next question of a mixed run is, from the answers so far: it starts easy, goes one step up after
 * every `stepUpAfter` correct answers in a row, and one step down after every miss.
 */
export function marathonDifficulty(answers: readonly Pick<MarathonAnswer, 'correct'>[]): Difficulty {
  let level = 0;
  let run = 0;
  for (const a of answers) {
    if (!a.correct) {
      level = Math.max(0, level - 1);
      run = 0;
    } else if (++run >= CONFIG.marathon.stepUpAfter) {
      level = Math.min(LADDER.length - 1, level + 1);
      run = 0;
    }
  }
  return LADDER[level];
}

/**
 * How much a concept is wanted: more the less the learner has mastered it (the mastery the app derives, 0 to 100),
 * more again for every miss on it in this run and less for every correct answer. Never nothing.
 */
export function conceptWeight(conceptId: string, mastery: Readonly<Record<string, number>>, answers: readonly MarathonAnswer[]): number {
  const { missBoost, correctRelief, floor } = CONFIG.marathon.weight;
  let weight = 101 - (Object.hasOwn(mastery, conceptId) ? mastery[conceptId] : 0);
  for (const a of answers) if (a.conceptId === conceptId) weight += a.correct ? -correctRelief : missBoost;
  return Math.max(floor, weight);
}

function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  let r = rng.next() * items.reduce((sum, item) => sum + weight(item), 0);
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

/** The items of the difficulty wanted; in a mixed run, when there are none, those of the nearest difficulty that has any. */
export function atDifficulty<T extends { difficulty: Difficulty }>(items: readonly T[], wanted: Difficulty, strict: boolean): T[] {
  const exact = items.filter((x) => x.difficulty === wanted);
  if (exact.length > 0 || strict) return exact;
  const at = LADDER.indexOf(wanted);
  const nearest = [...LADDER].sort((a, b) => Math.abs(LADDER.indexOf(a) - at) - Math.abs(LADDER.indexOf(b) - at) || LADDER.indexOf(a) - LADDER.indexOf(b));
  for (const d of nearest) {
    const found = items.filter((x) => x.difficulty === d);
    if (found.length > 0) return found;
  }
  return [];
}

export interface MarathonInput {
  pool: MarathonPool;
  /** The seed of the run (see `marathonSeed`). */
  seed: number;
  difficulty: MarathonDifficulty;
  /** Mastery by concept (0 to 100) as the run began; a concept never attempted is left out. */
  mastery: Readonly<Record<string, number>>;
  /** Every question served so far, in order, answered or not. The next question takes the position after them. */
  served: readonly Pick<Question, 'id'>[];
  /** The answers given so far, in order. */
  answers: readonly MarathonAnswer[];
}

/**
 * The question at the next position of a run: a pure function of the run's seed, the position and what has been
 * served and answered so far, so the same run always goes the same way.
 *
 * Every `authoredEvery`-th question is an authored one of the scope that the run has not asked yet, while there are
 * any; all the others are generated. The difficulty is the one chosen, or in a mixed run the one the answers so far
 * call for (`marathonDifficulty`). Among the concepts that have a template of that difficulty one is drawn by its
 * weight (`conceptWeight`), then one of its templates, never the template of the question just before when there is
 * another to take. Each position has a seed of its own, so no question id comes twice. Null when nothing is left to
 * serve (a scope with nothing available, or one difficulty that has run out of authored questions and has no template).
 */
export function nextMarathonQuestion(input: MarathonInput): Question | null {
  const { pool, seed, difficulty, mastery, served, answers } = input;
  const position = served.length;
  const rng = createRng((seed + position) ^ CHOICE_SALT);
  const strict = difficulty !== 'mixed';
  const wanted = strict ? difficulty : marathonDifficulty(answers);
  const weightOf = (x: { conceptId: string }) => conceptWeight(x.conceptId, mastery, answers);
  const asked = new Set(served.map((q) => q.id));

  const authored = atDifficulty(pool.questions.filter((q) => !asked.has(q.id)), wanted, strict);
  const templates = atDifficulty(pool.templates, wanted, strict);
  const authoredTurn = (position + 1) % CONFIG.marathon.authoredEvery === 0;
  if (authored.length > 0 && (authoredTurn || templates.length === 0)) return pickWeighted(rng, authored, weightOf);
  if (templates.length === 0) return null;

  const last = parseGenId(served.at(-1)?.id ?? '')?.templateId;
  const others = templates.filter((t) => t.id !== last);
  const candidates = others.length > 0 ? others : templates;
  const concepts = [...new Set(candidates.map((t) => t.conceptId))];
  const conceptId = pickWeighted(rng, concepts, (c) => conceptWeight(c, mastery, answers));
  const template = rng.pick(candidates.filter((t) => t.conceptId === conceptId));
  return generateQuestion(template.id, seed + position);
}

/**
 * The next few questions of a run, each chosen as `nextMarathonQuestion` chooses it with the ones before it in the
 * batch already served. A run asks for a batch when it starts and again whenever the learner reaches the last
 * question it has, so nothing is ever built beyond the next `count` questions. Shorter than `count` (also empty) when
 * the scope runs out.
 */
export function marathonBatch(input: MarathonInput, count: number = CONFIG.marathon.batch): Question[] {
  const batch: Question[] = [];
  for (let i = 0; i < count; i++) {
    const next = nextMarathonQuestion({ ...input, served: [...input.served, ...batch] });
    if (!next) break;
    batch.push(next);
  }
  return batch;
}
