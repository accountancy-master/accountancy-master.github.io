import { findQuestion } from '@/content/loaded';
import { findTemplateOutline, templatesForConcept, topicOfQuestion } from '@/content/outline';
import type { Difficulty, Question, QuestionOutline, TopicOutline, TopicPack } from '@/content/types';
import { createRng, type Rng } from '@/engine/rng';
import { parseGenId } from '@/generators/ids';
import { generateQuestion } from '@/generators/loaded';
import { isFormatKind, type TemplateOutline } from '@/generators/types';
import type { SessionKind } from '@/storage/types';
import { cardsToRevise, countDueCards, isRevisable, type CardState } from './cardReview';
import { CONFIG } from './config';
import { dueByDay } from './srs';
import type { Progress } from './progress';
import type { SessionItem } from './sessionBuilder';

// ---------------------------------------------------------------------------------------------------------------
// Seeds. A session uses seed + slot for its slots, so every session owns a block of SLOTS_PER_BLOCK seeds.
// Level seeds (levelSeed, order < 1000) stay below LEVEL_CEILING, practice seeds sit above that and daily seeds
// above the practice ones, so no two kinds of session can ever generate the same question.
// ---------------------------------------------------------------------------------------------------------------

const SLOTS_PER_BLOCK = 100;
const PLAYS_PER_KIND = 10_000;
const PRACTICE_BASE = 1_000_000_000;
const DAILY_BASE = 2_000_000_000;
const DAY_MS = 86_400_000;

/** Each kind owns a fixed run of blocks. Written out, never derived from list order, so adding a kind cannot move one. */
const KIND_BLOCK = {
  smart: 0,
  fresh: 1,
  mistakes: 2,
  cards: 3,
  daily_challenge: 4,
  daily_mission: 5,
  case: 6,
} as const satisfies Partial<Record<SessionKind, number>>;

/** The kinds of session that take their seeds from the practice range. */
export type PracticeSeedKind = keyof typeof KIND_BLOCK;

/** Seed base for a practice session. Each play of each kind gets its own non-overlapping block. */
export function practiceSeed(kind: PracticeSeedKind, playCount: number): number {
  if (!Object.hasOwn(KIND_BLOCK, kind) || !Number.isInteger(playCount) || playCount < 0 || playCount >= PLAYS_PER_KIND) {
    throw new Error('Invalid practice kind or play count');
  }
  return PRACTICE_BASE + (KIND_BLOCK[kind] * PLAYS_PER_KIND + playCount) * SLOTS_PER_BLOCK;
}

/** Seed base for the daily challenge: the same for everyone on a given local day (YYYY-MM-DD). */
export function dailySeed(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const at = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  // Date.UTC rolls 2026-02-31 over to March, so check the day survives a round trip.
  if (!m || !Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== day) {
    throw new Error(`Invalid day: ${day}`);
  }
  return DAILY_BASE + (at / DAY_MS) * SLOTS_PER_BLOCK;
}

// ---------------------------------------------------------------------------------------------------------------
// What may be served.
// ---------------------------------------------------------------------------------------------------------------

/** What practice may serve: generator templates and authored questions the ladder has introduced. */
export interface Available {
  templateIds: Set<string>;
  questionIds: Set<string>;
}

/**
 * What the learner has played: a template or authored question is available when a level that lists it (a template
 * it generates, a question it asks or checks in a lesson) has been passed, or when the learner has already
 * attempted that item (the authored id, or for a generated id its template). Levels not yet played add nothing,
 * so practice never serves the material of the next level.
 *
 * What a level lists is what it asks by id or generates (`generate`). A look-back level lists nothing: it asks about
 * earlier topics too, and passing it must not open them. A case-study level lists nothing either, since a case is
 * played whole and never one question at a time.
 */
export function availableItems(
  pack: TopicOutline,
  passedLevelIds: Iterable<string>,
  attemptedQuestionIds: Iterable<string> = [],
): Available {
  return availableFrom(pack, new Set(passedLevelIds), attemptedItems(attemptedQuestionIds));
}

/** What an attempt list says was attempted: the templates of generated questions, and the authored ids. */
interface Attempted {
  templateIds: Set<string>;
  questionIds: Set<string>;
}

function attemptedItems(attemptedQuestionIds: Iterable<string>): Attempted {
  const out: Attempted = { templateIds: new Set(), questionIds: new Set() };
  for (const id of attemptedQuestionIds) {
    const templateId = parseGenId(id)?.templateId;
    if (templateId !== undefined) out.templateIds.add(templateId);
    else out.questionIds.add(id);
  }
  return out;
}

function availableFrom(pack: Pick<TopicOutline, 'levels'>, passed: ReadonlySet<string>, attempted: Attempted): Available {
  const out: Available = { templateIds: new Set(), questionIds: new Set() };
  const listed: Available = { templateIds: new Set(), questionIds: new Set() };
  for (const level of pack.levels) {
    const targets = passed.has(level.id) ? [out, listed] : [listed];
    for (const target of targets) {
      for (const id of level.questionIds ?? []) target.questionIds.add(id);
      for (const b of level.lesson ?? []) if (b.type === 'check') target.questionIds.add(b.questionId);
      for (const id of level.generate?.templateIds ?? []) target.templateIds.add(id);
    }
  }
  // An attempt can only add what this topic's levels list.
  for (const id of attempted.templateIds) if (listed.templateIds.has(id)) out.templateIds.add(id);
  for (const id of attempted.questionIds) if (listed.questionIds.has(id)) out.questionIds.add(id);
  return out;
}

/** Everything available in any of the sets (for several topics). */
export function mergeAvailable(list: Available[]): Available {
  const out: Available = { templateIds: new Set(), questionIds: new Set() };
  for (const a of list) {
    for (const id of a.templateIds) out.templateIds.add(id);
    for (const id of a.questionIds) out.questionIds.add(id);
  }
  return out;
}

/**
 * What practice may serve this learner, over all the topics. With "unlock all levels" on it is everything the
 * levels list (as if every level had been passed); otherwise {@link availableItems}. The one place that decides it.
 */
export function availableForLearner(
  packs: readonly TopicOutline[],
  passedLevelIds: string[],
  attemptedQuestionIds: Iterable<string>,
  unlockAll: boolean,
): Available {
  // The attempt list can be long and every pack reads it, so it is sorted into templates and authored ids once.
  const passed = new Set(passedLevelIds);
  const attempted = attemptedItems(attemptedQuestionIds);
  const none: Attempted = { templateIds: new Set(), questionIds: new Set() };
  return mergeAvailable(
    packs.map((p) => (unlockAll ? availableFrom(p, new Set(p.levels.map((l) => l.id)), none) : availableFrom(p, passed, attempted))),
  );
}

/**
 * Everything the levels of these packs list, as if every level had been passed, whatever the learner has done and
 * whatever "unlock all levels" says (which is about the ladder alone). What play that unlocks nothing draws on: the
 * Marathon and the practice of a topic the learner chose, like the Playground.
 */
export const everythingIn = (packs: readonly TopicOutline[]): Available => availableForLearner(packs, [], [], true);

/** A concept that has something to serve: its available templates, or failing that its available authored questions. */
interface Source {
  conceptId: string;
  templates: TemplateOutline[];
  authored: QuestionOutline[];
}

/** The concepts of the packs that have something available, in pack order, each once. */
function sourcesOf(packs: readonly TopicOutline[], available: Available): Source[] {
  const out: Source[] = [];
  const seen = new Set<string>();
  // The available authored questions of each concept, grouped once rather than searched for again per concept.
  const authoredBy = new Map<string, QuestionOutline[]>();
  for (const q of packs.flatMap((x) => x.questions)) {
    if (available.questionIds.has(q.id)) authoredBy.set(q.conceptId, [...(authoredBy.get(q.conceptId) ?? []), q]);
  }
  for (const p of packs) {
    for (const c of p.concepts) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const templates = templatesForConcept(c.id).filter((t) => available.templateIds.has(t.id));
      const authored = templates.length > 0 ? [] : (authoredBy.get(c.id) ?? []);
      if (templates.length > 0 || authored.length > 0) out.push({ conceptId: c.id, templates, authored });
    }
  }
  return out;
}

const asItem = (question: Question): SessionItem => ({ kind: 'question', question });

// ---------------------------------------------------------------------------------------------------------------
// A session is planned, then made.
// ---------------------------------------------------------------------------------------------------------------

/**
 * One item of a session before it is made: a card or an authored question by its id, or a question to generate from
 * a template and a seed. A plan needs only the outlines of the packs, so a session can be counted (the Dashboard says
 * what today's mission holds) and the topics it draws on named (`plannedTopics`) while no topic is loaded.
 * `makeSession` then makes its items, which is what needs the packs and the generators themselves.
 */
export type Planned =
  | { kind: 'card'; cardId: string }
  | { kind: 'question'; questionId: string }
  | { kind: 'generate'; templateId: string; seed: number };

const planAuthored = (question: Pick<Question, 'id'>): Planned => ({ kind: 'question', questionId: question.id });

/** The topics a plan draws on, in the order of `packs` (the packs, or their outlines, it was planned over). */
export function plannedTopics(plan: readonly Planned[], packs: readonly TopicOutline[]): string[] {
  const cardIds = new Set(plan.flatMap((item) => (item.kind === 'card' ? [item.cardId] : [])));
  const questionIds = new Set(plan.flatMap((item) => (item.kind === 'question' ? [item.questionId] : [])));
  const generated = new Set(plan.flatMap((item) => (item.kind === 'generate' ? (findTemplateOutline(item.templateId)?.topicId ?? []) : [])));
  return packs
    .filter((p) => generated.has(p.topicId) || p.cards.some((c) => cardIds.has(c.id)) || p.questions.some((q) => questionIds.has(q.id)))
    .map((p) => p.topicId);
}

/** The items of a plan, from the packs it was planned over; every topic it draws on must have been loaded. */
export function makeSession(plan: readonly Planned[], packs: readonly TopicPack[]): SessionItem[] {
  const cards = new Map(packs.flatMap((p) => p.cards).map((c) => [c.id, c]));
  const questions = new Map(packs.flatMap((p) => p.questions).map((q) => [q.id, q]));
  return plan.map((item): SessionItem => {
    if (item.kind === 'generate') return asItem(generateQuestion(item.templateId, item.seed));
    if (item.kind === 'card') {
      const card = cards.get(item.cardId);
      if (!card) throw new Error(`Unknown card: ${item.cardId}`);
      return { kind: 'card', card };
    }
    const question = questions.get(item.questionId);
    if (!question) throw new Error(`Unknown question: ${item.questionId}`);
    return asItem(question);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Choosing questions.
// ---------------------------------------------------------------------------------------------------------------

const DIFFICULTY_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, complex: 2 };

/** Hands out the seeds seedBase, seedBase + 1, ... so no two generated questions in a session share one. */
function slots(seedBase: number, offset = 0) {
  let n = offset;
  return () => {
    if (n >= SLOTS_PER_BLOCK) throw new Error('Session needs more seed slots than a block holds');
    return seedBase + n++;
  };
}

/**
 * One question for a concept: from one of its available templates, otherwise one of its available authored
 * questions not used yet. Undefined when the concept has nothing left to serve.
 */
function questionFor(
  source: Source,
  rng: Rng,
  nextSeed: () => number,
  used: Set<string>,
  easiestOnly: boolean,
): Planned | undefined {
  let templates = source.templates;
  if (templates.length > 0) {
    if (easiestOnly) {
      const easiest = Math.min(...templates.map((t) => DIFFICULTY_RANK[t.difficulty]));
      templates = templates.filter((t) => DIFFICULTY_RANK[t.difficulty] === easiest);
    }
    return { kind: 'generate', templateId: rng.pick(templates).id, seed: nextSeed() };
  }
  const authored = source.authored.filter((q) => !used.has(q.id));
  if (authored.length === 0) return undefined;
  const q = rng.pick(authored);
  used.add(q.id);
  return planAuthored(q);
}

function smartQuestions(
  packs: readonly TopicOutline[],
  progress: Progress,
  available: Available,
  now: number,
  seed: number,
): Planned[] {
  const { weak, due, fresh } = CONFIG.practice.smart;
  const total = weak + due + fresh;
  const sources = sourcesOf(packs, available);
  const sourceOf = new Map(sources.map((x) => [x.conceptId, x]));
  const concepts = sources.map((x) => x.conceptId);
  const rng = createRng(seed);
  const nextSeed = slots(seed);
  const used = new Set<string>();
  const picked: Planned[] = [];
  const attempted = (c: string) => progress.concepts[c] !== undefined;
  const add = (conceptId: string): boolean => {
    // Ground the learner has never touched starts with its easiest templates.
    const q = questionFor(sourceOf.get(conceptId)!, rng, nextSeed, used, !attempted(conceptId));
    if (q) picked.push(q);
    return q !== undefined;
  };

  const byMastery = concepts
    .filter(attempted)
    .map((c, i) => ({ c, i, mastery: progress.concepts[c].mastery }))
    .sort((a, b) => a.mastery - b.mastery || a.i - b.i)
    .map((x) => x.c);

  const chosen = new Set<string>();
  const take = (order: string[], quota: number) => {
    let made = 0;
    for (const c of order) {
      if (made >= quota) break;
      if (add(c)) {
        chosen.add(c);
        made++;
      }
    }
  };

  take(byMastery, weak);
  take(
    concepts
      .filter((c) => !chosen.has(c) && attempted(c) && dueByDay(progress.concepts[c].review.dueAt, now))
      .map((c, i) => ({ c, i, dueAt: progress.concepts[c].review.dueAt }))
      .sort((a, b) => a.dueAt - b.dueAt || a.i - b.i)
      .map((x) => x.c),
    due,
  );
  take(concepts.filter((c) => !chosen.has(c) && !attempted(c)), fresh);

  // Any shortfall: the weakest concepts again, then every concept, going round until full or nothing is left.
  for (const pool of [byMastery, concepts]) {
    for (let progressed = true; progressed && picked.length < total; ) {
      progressed = false;
      for (const c of pool) {
        if (picked.length >= total) break;
        if (add(c)) progressed = true;
      }
    }
  }

  return rng.shuffle(picked);
}

/** Mixed practice: weakest ideas, ideas due for review and new ground. Fewer than usual if little is unlocked. */
export const planSmartPractice = (packs: readonly TopicOutline[], progress: Progress, available: Available, now: number, seed: number): Planned[] =>
  smartQuestions(packs, progress, available, now, seed);

/** Smart practice as it is played: the plan, made from the packs. */
export function buildSmartPractice(
  packs: TopicPack[],
  progress: Progress,
  available: Available,
  now: number,
  seed: number,
): SessionItem[] {
  return makeSession(planSmartPractice(packs, progress, available, now, seed), packs);
}

/** Newly generated questions only, leaning towards the concepts the learner knows least. */
export function planFreshQuestions(pack: TopicOutline, progress: Progress, available: Available, seed: number): Planned[] {
  const sources = sourcesOf([pack], available).filter((x) => x.templates.length > 0);
  if (sources.length === 0) return [];
  const weights = sources.map((x) => 101 - (progress.concepts[x.conceptId]?.mastery ?? 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  const rng = createRng(seed);
  const nextSeed = slots(seed);
  const items: Planned[] = [];
  for (let i = 0; i < CONFIG.practice.freshCount; i++) {
    let r = rng.next() * sum;
    let index = 0;
    while (index < sources.length - 1 && r >= weights[index]) r -= weights[index++];
    const template = rng.pick(sources[index].templates);
    items.push({ kind: 'generate', templateId: template.id, seed: nextSeed() });
  }
  return items;
}

/** Fresh questions as they are played. */
export function buildFreshQuestions(
  pack: TopicPack,
  progress: Progress,
  available: Available,
  seed: number,
): SessionItem[] {
  return makeSession(planFreshQuestions(pack, progress, available, seed), [pack]);
}

// ---------------------------------------------------------------------------------------------------------------
// Mistakes and cards.
// ---------------------------------------------------------------------------------------------------------------

type OpenMistake = { questionId: string; question: Question; mistakeCode?: string };

// The Dashboard, the hub, the recommendation and the Progress screen each ask for these on every render, and each
// asks about every open mistake. A progress object is never changed once derived, so the answer is kept for it.
const openMistakesOf = new WeakMap<Progress, OpenMistake[]>();
const openMistakeIdsOf = new WeakMap<Progress, string[]>();
const correctedCountOf = new WeakMap<Progress, number>();

/**
 * The ids of the open mistakes whose question this version still has, the one opened longest ago first. An id says
 * whether its question exists (see `topicOfQuestion`), so this needs no topic loaded: it is what the screens that
 * only count mistakes use, and what says which topics to load before the mistakes themselves are looked up.
 */
export function openMistakeIds(progress: Progress): string[] {
  const kept = openMistakeIdsOf.get(progress);
  if (kept) return [...kept];
  const out: { questionId: string; at: number }[] = [];
  for (const [questionId, r] of Object.entries(progress.questions)) {
    if (r.mistakeOpen && topicOfQuestion(questionId) !== undefined) out.push({ questionId, at: r.mistakeAt ?? 0 });
  }
  out.sort((a, b) => a.at - b.at || (a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0));
  const list = out.map((m) => m.questionId);
  openMistakeIdsOf.set(progress, list);
  return [...list];
}

/**
 * Open mistakes whose question can still be served, the one opened longest ago first, each with its question. The
 * topics of the mistakes must have been loaded (`topicsOfQuestions` of `openMistakeIds` names them).
 */
export function openMistakes(progress: Progress): OpenMistake[] {
  const kept = openMistakesOf.get(progress);
  if (kept) return [...kept];
  const list = openMistakeIds(progress).flatMap((questionId): OpenMistake[] => {
    const question = findQuestion(questionId);
    return question ? [{ questionId, question, mistakeCode: progress.questions[questionId].mistakeCode }] : [];
  });
  openMistakesOf.set(progress, list);
  return [...list];
}

/** How many times a mistake has been put right, over questions this version still has. It never goes down. */
export function correctedCount(progress: Progress): number {
  const kept = correctedCountOf.get(progress);
  if (kept !== undefined) return kept;
  const count = Object.entries(progress.questions).reduce((n, [id, r]) => {
    const corrected = r.corrected ?? 0;
    // Only a question that was corrected needs looking up.
    return corrected > 0 && topicOfQuestion(id) !== undefined ? n + corrected : n;
  }, 0);
  correctedCountOf.set(progress, count);
  return count;
}

/** The open mistakes, served again by their exact ids so a correct answer closes them. */
export function buildMistakeReview(progress: Progress): SessionItem[] {
  return openMistakes(progress)
    .slice(0, CONFIG.practice.mistakesMax)
    .map((m) => asItem(m.question));
}

/** The cards that may be revised: every card but those beyond the syllabus. */
const allCards = (packs: readonly TopicOutline[]) => packs.flatMap((p) => p.cards).filter(isRevisable);

/**
 * Which cards may be offered as new: those of the active topics, or every card when `activeTopicIds` is left out. A
 * card already seen is due or not whatever its topic; this limits only the cards never seen.
 */
const newCardsFrom =
  (activeTopicIds?: readonly string[]) =>
  (card: { topicId: string }): boolean =>
    activeTopicIds === undefined || activeTopicIds.includes(card.topicId);

/**
 * What is waiting to be practised: cards due (any topic), cards never seen (in the active topics only), and open
 * mistakes. Shared by the Dashboard and the hub. `packs` are all the playable packs.
 */
export function practiceCounts(
  packs: readonly TopicOutline[],
  progress: Progress,
  states: Record<string, CardState>,
  now: number,
  activeTopicIds?: readonly string[],
): { due: number; fresh: number; mistakes: number } {
  const cards = allCards(packs);
  const isNew = newCardsFrom(activeTopicIds);
  return {
    due: countDueCards(cards, states, now),
    fresh: cards.filter((c) => !states[c.id] && isNew(c)).length,
    mistakes: openMistakeIds(progress).length,
  };
}

const cardItems = (
  packs: readonly TopicOutline[],
  states: Record<string, CardState>,
  now: number,
  limit: number,
  activeTopicIds?: readonly string[],
): Planned[] =>
  cardsToRevise(allCards(packs), states, now, limit, newCardsFrom(activeTopicIds)).map((card) => ({ kind: 'card', cardId: card.id }));

/** Due cards first (from any topic), then new cards from the active topics only. `packs` are all the playable packs. */
export const planCardSession = (packs: readonly TopicOutline[], states: Record<string, CardState>, now: number, activeTopicIds?: readonly string[]): Planned[] =>
  cardItems(packs, states, now, CONFIG.practice.cardsPerSession, activeTopicIds);

/** A card session as it is played. */
export function buildCardSession(
  packs: TopicPack[],
  states: Record<string, CardState>,
  now: number,
  activeTopicIds?: readonly string[],
): SessionItem[] {
  return makeSession(planCardSession(packs, states, now, activeTopicIds), packs);
}

// ---------------------------------------------------------------------------------------------------------------
// Daily challenge and mission.
// ---------------------------------------------------------------------------------------------------------------

/**
 * What is available without the formats (accounts and statements to prepare). The daily challenge and the daily
 * mission are short rounds that earn a bonus for half their questions right; a format takes about ten minutes and is
 * right only as a whole, so neither serves one. Smart practice, fresh questions, a marathon and the review of
 * mistakes serve formats like any other question.
 */
export function withoutFormats(available: Available): Available {
  const templateIds = new Set([...available.templateIds].filter((id) => !isFormatId(id)));
  return { templateIds, questionIds: available.questionIds };
}

const isFormatId = (templateId: string): boolean => {
  const template = findTemplateOutline(templateId);
  return template !== undefined && isFormatKind(template.kind);
};

/** Available templates of the packs' concepts in the first difficulty group that has any. Never a format. */
function challengePool(packs: readonly TopicOutline[], available: Available, groups: Difficulty[][]): TemplateOutline[] {
  const all = sourcesOf(packs, withoutFormats(available)).flatMap((x) => x.templates);
  for (const group of groups) {
    const pool = all.filter((t) => group.includes(t.difficulty));
    if (pool.length > 0) return pool;
  }
  return [];
}

function challengeQuestions(pool: TemplateOutline[], count: number, rng: Rng, nextSeed: () => number): Planned[] {
  if (pool.length === 0) return [];
  return Array.from({ length: count }, (): Planned => ({ kind: 'generate', templateId: rng.pick(pool).id, seed: nextSeed() }));
}

/**
 * Harder generated questions, the same for everyone on the same day with the same available items. Easy ones if
 * nothing harder is unlocked, and authored questions if no generator is.
 */
export function planDailyChallenge(packs: readonly TopicOutline[], available: Available, day: string): Planned[] {
  const seed = dailySeed(day);
  const rng = createRng(seed);
  const pool = challengePool(packs, available, [['medium', 'complex'], ['easy']]);
  if (pool.length > 0) return challengeQuestions(pool, CONFIG.practice.dailyChallengeCount, rng, slots(seed));
  const authored = sourcesOf(packs, withoutFormats(available)).flatMap((x) => x.authored);
  return rng.shuffle(authored).slice(0, CONFIG.practice.dailyChallengeCount).map(planAuthored);
}

/** The daily challenge as it is played. */
export function buildDailyChallenge(packs: TopicPack[], available: Available, day: string): SessionItem[] {
  return makeSession(planDailyChallenge(packs, available, day), packs);
}

// Smart practice uses the first slots of a mission's block and the challenge questions start here.
const MISSION_CHALLENGE_SLOT = 50;
const MISSION_CHALLENGE_SALT = 0x2545f491;

/**
 * Rule cards to revise, then smart practice, then a few of the hardest questions available. Empty without a question.
 * `packs` are the packs the questions come from (the active topics). The cards come from `cardScope.packs` (every
 * playable pack: due cards of any topic) with new ones limited to `cardScope.activeTopicIds`; without it they follow
 * `packs` entirely.
 */
export function planDailyMission(
  packs: readonly TopicOutline[],
  progress: Progress,
  states: Record<string, CardState>,
  available: Available,
  now: number,
  seed: number,
  cardScope?: { packs: readonly TopicOutline[]; activeTopicIds: readonly string[] },
): Planned[] {
  const { cards, questions, challenge } = CONFIG.practice.mission;
  const practice = smartQuestions(packs, progress, withoutFormats(available), now, seed).slice(0, questions);
  const pool = challengePool(packs, available, [['complex'], ['medium'], ['easy']]);
  const hard = challengeQuestions(
    pool,
    challenge,
    createRng(seed ^ MISSION_CHALLENGE_SALT),
    slots(seed, MISSION_CHALLENGE_SLOT),
  );
  // A mission never consists of cards alone: with no question to serve there is no mission.
  if (practice.length + hard.length === 0) return [];
  const cardsOf = cardScope
    ? cardItems(cardScope.packs, states, now, cards, cardScope.activeTopicIds)
    : cardItems(packs, states, now, cards);
  return [...cardsOf, ...practice, ...hard];
}

/** The daily mission as it is played. */
export function buildDailyMission(
  packs: TopicPack[],
  progress: Progress,
  states: Record<string, CardState>,
  available: Available,
  now: number,
  seed: number,
  cardScope?: { packs: TopicPack[]; activeTopicIds: readonly string[] },
): SessionItem[] {
  return makeSession(planDailyMission(packs, progress, states, available, now, seed, cardScope), [...packs, ...(cardScope?.packs ?? [])]);
}
