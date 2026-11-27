import type { Card, LessonBlock, Level, Question, TopicPack } from '@/content/types';
import { createRng } from '@/engine/rng';
import { generateCaseQuestions, generateQuestion } from '@/generators/loaded';
import { CONFIG } from './config';

export type SessionItem =
  | { kind: 'lesson'; blocks: LessonBlock[] }
  | { kind: 'card'; card: Card }
  /**
   * `extra` marks a question inserted during play ("Try a similar question", or a lesson's check tried again): it is
   * answered and recorded, but not scored. `check` marks the check question of a lesson (see `lessonOnly`).
   */
  | { kind: 'question'; question: Question; extra?: true; check?: true };

// A level of sets, or of formats, lists more than it serves too, so every play takes them in another order.
const SHUFFLED: Level['type'][] = ['mixed_practice', 'challenge', 'look_back', 'set_practice', 'format_practice'];
// Keeps the template-order stream apart from the stream that shuffles the generated items.
const TEMPLATE_ORDER_SALT = 0x5bd1e995;
// And the stream that chooses the earlier topics of a look-back level apart from both.
const LOOK_BACK_SALT = 0x3c6ef372;
// And the stream that orders the authored questions of a replay apart from all of them.
const AUTHORED_ORDER_SALT = 0x27d4eb2f;
/** A level session owns a block of this many seeds, one block per play (see `levelSeed`). */
const SLOTS_PER_PLAY = 100;
/** A level has room for this many plays before the next level's blocks begin (see `levelSeed`). */
const PLAYS_PER_LEVEL = 10_000;

type LookBack = NonNullable<Level['lookBack']>;

export interface LevelSessionOptions {
  /**
   * For a look-back level: the topics the learner has played, weakest first (see `weakestTopics`). Its questions
   * from earlier topics come from these first. Left out, or for a learner with no history, they are spread by seed.
   */
  weakestTopicIds?: readonly string[];
}

/** How many questions a look-back level asks: of its own topic, and of earlier ones. */
export function lookBackSize(lookBack: LookBack): { own: number; earlier: number } {
  return {
    own: lookBack.templateIds.length > 0 ? CONFIG.lookBack.own : 0,
    earlier: lookBack.earlier.length > 0 ? CONFIG.lookBack.earlier : 0,
  };
}

/**
 * A look-back level's questions from earlier topics, one topic and one of its templates per question. Each comes
 * from a different earlier topic while there are enough of them (then round again): the learner's weakest topics
 * first, in the order given, then the rest in an order drawn from the seed. The template within a topic is drawn
 * from the seed.
 */
function earlierQuestions(lookBack: LookBack, count: number, seedBase: number, weakestTopicIds: readonly string[]): { topicId: string; templateId: string }[] {
  const rng = createRng(seedBase ^ LOOK_BACK_SALT);
  const weakest = [...new Set(weakestTopicIds)].flatMap((id) => lookBack.earlier.find((t) => t.topicId === id) ?? []);
  const topics = [...weakest, ...rng.shuffle(lookBack.earlier.filter((t) => !weakest.includes(t)))];
  return Array.from({ length: count }, (_, i) => {
    const topic = topics[i % topics.length];
    return { topicId: topic.topicId, templateId: rng.pick(topic.templateIds) };
  });
}

/**
 * The topics, besides its own, that one play of a level asks questions of: for a look-back level the earlier topics
 * drawn for this seed and these options, each once; for any other level none. They must be loaded before the
 * session is built (see content/loadTopics.ts).
 */
export function earlierTopicsOf(level: Pick<Level, 'lookBack'>, seedBase: number, options: LevelSessionOptions = {}): string[] {
  if (!level.lookBack) return [];
  const { earlier } = lookBackSize(level.lookBack);
  return [...new Set(earlierQuestions(level.lookBack, earlier, seedBase, options.weakestTopicIds ?? []).map((q) => q.topicId))];
}

/**
 * The items of one play of a level. The same level, pack, seed and options always give the same items: a lesson and
 * its checks, cards, authored questions and generated ones, in that order. A mixed, challenge or look-back level
 * shuffles what it generates; a case-study level serves one whole case, its questions in their own order.
 */
export function buildLevelSession(level: Level, pack: TopicPack, seedBase: number, options: LevelSessionOptions = {}): SessionItem[] {
  if (!Number.isSafeInteger(seedBase) || seedBase < 0) throw new Error(`Invalid seed: ${seedBase}`);
  const authored = (id: string): Extract<SessionItem, { kind: 'question' }> => {
    const question = pack.questions.find((q) => q.id === id);
    if (!question) throw new Error(`Unknown question: ${id}`);
    return { kind: 'question', question };
  };

  const items: SessionItem[] = [];

  if (level.lesson?.length) {
    items.push({ kind: 'lesson', blocks: level.lesson });
    for (const b of level.lesson) if (b.type === 'check') items.push({ ...authored(b.questionId), check: true });
  }

  for (const id of level.cardIds ?? []) {
    const card = pack.cards.find((c) => c.id === id);
    if (!card) throw new Error(`Unknown card: ${id}`);
    items.push({ kind: 'card', card });
  }

  // The first play asks a level's authored questions in the order they are listed. A replay asks them in an order of
  // its own, drawn from its seed, so that passing a level again is not a matter of remembering the answers in order.
  const questionIds = level.questionIds ?? [];
  const play = playOf(seedBase);
  for (const id of play === 0 ? questionIds : replayOrder(questionIds, seedBase)) items.push(authored(id));

  // A look-back level generates like a mixed one, from its own topic's templates, and then from earlier topics.
  const size = level.lookBack ? lookBackSize(level.lookBack) : { own: 0, earlier: 0 };
  const generate = level.lookBack ? { templateIds: level.lookBack.templateIds, count: size.own } : level.generate;

  if (generate) {
    const { templateIds, count } = generate;
    if (count > 0 && templateIds.length === 0) throw new Error(`Level ${level.id} has no templates`);
    const shuffled = SHUFFLED.includes(level.type);
    // Mixed levels list more templates than they serve, so shuffle the template order by seed first
    // and any template can appear. Other levels cycle in listed order. Either way, slot i uses seed
    // seedBase + i, so no two questions in a session share an id.
    const order = shuffled ? createRng(seedBase ^ TEMPLATE_ORDER_SALT).shuffle(templateIds) : templateIds;
    const templates = Array.from({ length: count }, (_, i) => order[i % order.length]);
    if (level.lookBack) templates.push(...earlierQuestions(level.lookBack, size.earlier, seedBase, options.weakestTopicIds ?? []).map((q) => q.templateId));
    const generated = templates.map((id, i): SessionItem => ({ kind: 'question', question: generateQuestion(id, seedBase + i) }));
    items.push(...(shuffled ? createRng(seedBase).shuffle(generated) : generated));
  }

  if (level.cases) {
    const { caseIds } = level.cases;
    if (caseIds.length === 0) throw new Error(`Level ${level.id} has no cases`);
    // Each play has its own block of seeds, so the number of the block goes up by one per play: the cases take turns.
    // Every question of the case is made from the one seed, which is what makes them one case.
    // The number of the play itself, without the level's part of the seed: the first play gives the first case
    // however many cases the level has.
    const caseId = caseIds[play % caseIds.length];
    for (const question of generateCaseQuestions(caseId, seedBase)) items.push({ kind: 'question', question });
  }

  return items;
}

/** The number of the play a seed belongs to (0 for the first play of a level), without the level's part of the seed. */
const playOf = (seedBase: number): number => Math.floor(seedBase / SLOTS_PER_PLAY) % PLAYS_PER_LEVEL;

/**
 * The order a replay asks a level's authored questions in: a shuffle drawn from the seed, which is never the listed
 * order (the order of the first play) where there are two questions or more.
 */
export function replayOrder<T>(listed: readonly T[], seedBase: number): T[] {
  if (listed.length < 2) return [...listed];
  const order = createRng(seedBase ^ AUTHORED_ORDER_SALT).shuffle(listed);
  return order.every((x, i) => x === listed[i]) ? [...order.slice(1), order[0]] : order;
}

/**
 * True for a session whose only scored questions are the checks of a lesson (a lesson level): it is passed by working
 * through it, and its checks are practice. Their answers are recorded and scored as any, so the score still says how
 * many were right first time.
 */
export const lessonOnly = (items: SessionItem[]): boolean =>
  items.some((i) => i.kind === 'question' && i.check === true) && items.every((i) => i.kind !== 'question' || i.check === true);

/** The questions that make up the score: every question except the extras inserted during play. */
export const countScored = (items: SessionItem[]): number =>
  items.filter((i) => i.kind === 'question' && !i.extra).length;
