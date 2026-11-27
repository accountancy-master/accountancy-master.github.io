import type { CaseStage } from '@/generators/cases';
import { outsidePapers } from '@/generators/outsidePapers';
import { getTemplate } from '@/generators/loaded';
import { isFormatKind } from '@/generators/types';
import type { Difficulty, LessonBlock, Level, LevelType, LookBackTopic, SimulationSpec, TopicPack } from './types';

interface Titled {
  title: string;
  description: string;
}

/** One practice level: which templates it serves and how many questions. */
export interface PracticeSpec extends Titled {
  templateIds: string[];
  count: number;
  /** A guided level (the method laid out) sits between the easy and the medium levels. */
  guided?: boolean;
  timerSecondsPerQuestion?: number;
}

/**
 * A level of sets of journal entries ("Journalise the following transactions"). Each play serves `count` sets, taken
 * from the templates in an order drawn for the play. A set is right only when every entry in it is right, so the
 * pass mark of such a level is `SET_PASS_MARK` unless one is given.
 */
export interface SetLevelSpec extends Titled {
  templateIds: string[];
  count: number;
  passMark?: number;
}

/** Two sets of three, or one of two, wholly right pass a level of sets. */
export const SET_PASS_MARK = 0.5;

/**
 * The levels of sets of a topic, to stand after the levels it has: orders from `firstOrder` on, and ids of their own
 * (`<topicId>-journal-sets-<n>`, counted from 1), so adding them renumbers nothing a learner has already passed and
 * a level added to the ladder later does not take their ids. A spec without templates gives no level.
 */
export function setLevels(topicId: string, firstOrder: number, specs: SetLevelSpec[]): Level[] {
  return specs
    .filter((s) => s.templateIds.length > 0)
    .map((s, i) => {
      for (const id of s.templateIds) if (getTemplate(id).kind !== 'journal_set') throw new Error(`Template ${id} does not make sets`);
      return {
        id: `${topicId}-journal-sets-${i + 1}`,
        topicId,
        order: firstOrder + i,
        type: 'set_practice',
        title: s.title,
        description: s.description,
        passMark: s.passMark ?? SET_PASS_MARK,
        generate: { templateIds: s.templateIds, count: s.count },
      };
    });
}

/**
 * A level of formats: accounts and statements the student prepares (a ledger account, a Trial Balance). Each play
 * serves `count` formats, taken from the templates in an order drawn for the play. A format is right only when every
 * row of it is right, so the pass mark of such a level is `FORMAT_PASS_MARK` unless one is given.
 */
export interface FormatLevelSpec extends Titled {
  templateIds: string[];
  count: number;
  passMark?: number;
}

/** As for sets: one format of two, or two of three, wholly right pass a level of formats. */
export const FORMAT_PASS_MARK = SET_PASS_MARK;

/**
 * The levels of formats of a topic, to stand after the levels it has (its levels of sets among them): orders from
 * `firstOrder` on, and ids of their own (`<topicId>-formats-<n>`, counted from 1), so adding them renumbers nothing.
 * A spec without templates gives no level.
 */
export function formatLevels(topicId: string, firstOrder: number, specs: FormatLevelSpec[]): Level[] {
  return specs
    .filter((s) => s.templateIds.length > 0)
    .map((s, i) => {
      for (const id of s.templateIds) if (!isFormatKind(getTemplate(id).kind)) throw new Error(`Template ${id} does not make a format`);
      return {
        id: `${topicId}-formats-${i + 1}`,
        topicId,
        order: firstOrder + i,
        type: 'format_practice',
        title: s.title,
        description: s.description,
        passMark: s.passMark ?? FORMAT_PASS_MARK,
        generate: { templateIds: s.templateIds, count: s.count },
      };
    });
}

/**
 * A level added to a topic after learners have played it: authored questions to recognise, templates to practise,
 * or both. `name` makes its id (`<topicId>-<name>`), so it takes no id a level already has.
 */
export interface LaterLevelSpec extends Titled {
  name: string;
  type: Extract<LevelType, 'rule_recognition' | 'method_recognition' | 'easy_practice' | 'guided_practice' | 'medium_practice' | 'complex_practice' | 'mixed_practice'>;
  questionIds?: string[];
  generate?: { templateIds: string[]; count: number };
}

/**
 * Levels added to a topic after its ladder was played: they stand after every level it has (its levels of sets and of
 * formats too), in the order given, with ids of their own (`<topicId>-<name>`), so no level a learner has passed is
 * renumbered or moved. The registry still adds Look back and the case studies after them. Throws for a name used
 * twice, a level with nothing in it, and a format or a template beyond the syllabus listed on one.
 */
export function laterLevels(topicId: string, after: readonly Pick<Level, 'order'>[], specs: LaterLevelSpec[]): Level[] {
  const first = after.reduce((top, l) => Math.max(top, l.order + 1), 0);
  const names = new Set<string>();
  return specs.map((s, i) => {
    if (names.has(s.name)) throw new Error(`Two later levels of ${topicId} are named ${s.name}`);
    names.add(s.name);
    if (!s.questionIds?.length && !s.generate?.templateIds.length) throw new Error(`Later level ${s.name} of ${topicId} has nothing in it`);
    for (const id of s.generate?.templateIds ?? []) {
      const t = getTemplate(id);
      if (isFormatKind(t.kind)) throw new Error(`Template ${id} makes a format: list it under formats, not in "${s.title}"`);
      if (t.beyondSyllabus !== undefined) throw new Error(`Template ${id} is beyond the syllabus: it stands on no level ("${s.title}")`);
    }
    return {
      id: `${topicId}-${s.name}`,
      topicId,
      order: first + i,
      type: s.type,
      title: s.title,
      description: s.description,
      ...(s.questionIds?.length ? { questionIds: s.questionIds } : {}),
      ...(s.generate ? { generate: s.generate } : {}),
    };
  });
}

/** True for a level whose id says where it stands (`<topicId>-level-<n>`), which is renumbered when levels move. */
const idByPosition = (level: Pick<Level, 'id' | 'topicId'>) => /^-level-\d+$/.test(level.id.slice(level.topicId.length));

/**
 * The short description of a topic's ladder. Every part is optional, and a part with nothing in it is left out, so a
 * topic can start with a lesson and a few templates and grow.
 */
export interface LadderSpec {
  /** Level 0: the lesson that builds the idea. */
  concept?: Titled & { lesson: LessonBlock[] };
  /**
   * Levels of the simulator, right after the lesson (see `simulationLevels`): watch the books move, predict, find the
   * mistake. Their ids are their own (`<topicId>-simulation-<n>`), so adding them renumbers no level's id.
   */
  simulations?: (Titled & SimulationSpec & { passMark?: number })[];
  /** The rule cards to revise before practising. */
  cards?: Titled & { cardIds: string[] };
  /** Authored questions on recognising the rule or the method; a first level is "rule", a second "method". */
  recognition?: (Titled & { questionIds: string[]; type?: 'rule_recognition' | 'method_recognition' })[];
  /** Practice levels. They are ordered easy, guided, medium, complex by the difficulty of their templates. */
  practice?: PracticeSpec[];
  /** Everything in the topic, shuffled. `templateIds` defaults to every template used in the practice levels. */
  mixed?: Titled & { count: number; templateIds?: string[] };
  /** The hardest questions, timed. `templateIds` defaults to the practice templates of the highest difficulty. */
  challenge?: Titled & { count: number; templateIds?: string[]; timerSecondsPerQuestion?: number };
  /**
   * Levels of sets of journal entries, after everything else, with ids of their own (see `setLevels`). The sets are
   * kept out of the practice, mixed and challenge levels: list them here only.
   */
  sets?: SetLevelSpec[];
  /**
   * Levels of formats (accounts and statements to prepare), after the levels of sets, with ids of their own (see
   * `formatLevels`). A format is a long question: list it here only, never in a practice, mixed or challenge level.
   */
  formats?: FormatLevelSpec[];
}

const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, complex: 2 };
const PRACTICE_TYPE: Record<Difficulty, LevelType> = {
  easy: 'easy_practice',
  medium: 'medium_practice',
  complex: 'complex_practice',
};
const CHALLENGE_SECONDS = 90;

const unique = (ids: string[]) => [...new Set(ids)];

function hardest(templateIds: string[]): Difficulty {
  return templateIds.reduce<Difficulty>((top, id) => (RANK[getTemplate(id).difficulty] > RANK[top] ? getTemplate(id).difficulty : top), 'easy');
}

/**
 * The standard ladder for a topic, with ids `<topicId>-level-<n>` counted from 0 in the order the levels come:
 * concept, cards, recognition, easy, guided, medium, complex, mixed, challenge. A level with nothing in it is
 * skipped and the rest are renumbered, so ids follow the position: add new levels at the end of a topic that has
 * already been played. Levels of sets and then levels of formats come last and keep ids of their own, whatever is
 * added before them. Throws for a template that does not exist, and for a format listed on any other level.
 */
export function buildLadder(topicId: string, spec: LadderSpec): Level[] {
  const drafts: Omit<Level, 'id' | 'topicId' | 'order'>[] = [];

  if (spec.concept?.lesson.length) {
    const { title, description, lesson } = spec.concept;
    drafts.push({ type: 'concept', title, description, lesson });
  }
  if (spec.cards?.cardIds.length) {
    const { title, description, cardIds } = spec.cards;
    drafts.push({ type: 'card_revision', title, description, cardIds });
  }
  (spec.recognition ?? []).forEach((r, i) => {
    if (r.questionIds.length === 0) return;
    const type = r.type ?? (i === 0 ? 'rule_recognition' : 'method_recognition');
    drafts.push({ type, title: r.title, description: r.description, questionIds: r.questionIds });
  });

  const practice = (spec.practice ?? [])
    .filter((p) => p.templateIds.length > 0)
    .map((p) => ({ p, difficulty: hardest(p.templateIds) }))
    .map((x) => ({ ...x, group: x.p.guided ? 1 : x.difficulty === 'easy' ? 0 : x.difficulty === 'medium' ? 2 : 3 }))
    .sort((a, b) => a.group - b.group); // Array.prototype.sort is stable: authors' order holds within a group.
  for (const { p, difficulty } of practice) {
    drafts.push({
      type: p.guided ? 'guided_practice' : PRACTICE_TYPE[difficulty],
      title: p.title,
      description: p.description,
      generate: { templateIds: p.templateIds, count: p.count },
      ...(p.timerSecondsPerQuestion ? { timerSecondsPerQuestion: p.timerSecondsPerQuestion } : {}),
    });
  }

  const used = unique(practice.flatMap((x) => x.p.templateIds));
  if (spec.mixed) {
    const templateIds = unique(spec.mixed.templateIds ?? used);
    if (templateIds.length > 0) {
      drafts.push({
        type: 'mixed_practice',
        title: spec.mixed.title,
        description: spec.mixed.description,
        generate: { templateIds, count: spec.mixed.count },
      });
    }
  }
  if (spec.challenge) {
    const top = used.length > 0 ? hardest(used) : 'easy';
    const templateIds = unique(spec.challenge.templateIds ?? used.filter((id) => getTemplate(id).difficulty === top));
    if (templateIds.length > 0) {
      drafts.push({
        type: 'challenge',
        title: spec.challenge.title,
        description: spec.challenge.description,
        generate: { templateIds, count: spec.challenge.count },
        timerSecondsPerQuestion: spec.challenge.timerSecondsPerQuestion ?? CHALLENGE_SECONDS,
      });
    }
  }

  // A format takes minutes and is right only as a whole: it has levels of its own and stands in no other.
  for (const d of drafts) {
    const beyond = d.generate?.templateIds.find((id) => getTemplate(id).beyondSyllabus !== undefined);
    if (beyond) throw new Error(`Template ${beyond} is beyond the syllabus: it stands on no level ("${d.title}")`);
    const format = d.generate?.templateIds.find((id) => isFormatKind(getTemplate(id).kind));
    if (format) throw new Error(`Template ${format} makes a format: list it under formats, not in "${d.title}"`);
  }

  // The simulation levels stand after the lesson; every other level keeps the id of its place without them.
  const numbered = drafts.map((d, n): Omit<Level, 'order'> => ({ id: `${topicId}-level-${n}`, topicId, ...d }));
  const at = spec.concept?.lesson.length ? 1 : 0;
  const placed = [...numbered.slice(0, at), ...simulationLevels(topicId, spec.simulations ?? []), ...numbered.slice(at)];
  const levels = placed.map((l, order): Level => ({ ...l, order }));
  const sets = setLevels(topicId, levels.length, spec.sets ?? []);
  return [...levels, ...sets, ...formatLevels(topicId, levels.length + sets.length, spec.formats ?? [])];
}

/**
 * The simulation levels of a topic, without their orders (their place is given where they are put): ids of their
 * own, `<topicId>-simulation-<n>` counted from 1, so that putting them before other levels renumbers nothing.
 */
export function simulationLevels(topicId: string, specs: (Titled & SimulationSpec & { passMark?: number })[]): Omit<Level, 'order'>[] {
  return specs.map(({ title, description, passMark, ...simulation }, i) => ({
    id: `${topicId}-simulation-${i + 1}`,
    topicId,
    type: 'simulation' as const,
    title,
    description,
    ...(passMark !== undefined ? { passMark } : {}),
    simulation,
  }));
}

const QUIZ_SIZE = 10;
const QUIZ_MIN = 4;
const isRecognition = (l: Level) => l.type === 'rule_recognition' || l.type === 'method_recognition';

/**
 * The pack with every authored question on some level, so none is written and never asked (but one beyond the
 * syllabus, which stands on none and is asked in a Marathon that includes it). Questions no level lists
 * (in a question level or as a lesson check) are put on quiz levels of about ten, placed just before the first mixed
 * level (at the end when there is none); a handful too small for a level of its own joins the last question level.
 * Level ids are renumbered by position when levels are added (a level with an id of its own, such as a level of
 * sets, keeps it). A pack with no levels, or nothing left over, is returned as it is.
 */
export function withQuizLevels(pack: TopicPack): TopicPack {
  if (pack.levels.length === 0) return pack;
  const listed = new Set(
    pack.levels.flatMap((l) => [...(l.questionIds ?? []), ...(l.lesson ?? []).flatMap((b) => (b.type === 'check' ? [b.questionId] : []))]),
  );
  // A question beyond the syllabus stands on no level: the Marathon asks it when the learner wants it.
  const left = pack.questions.filter((q) => !listed.has(q.id) && q.beyondSyllabus === undefined).map((q) => q.id);
  if (left.length === 0) return pack;

  const last = pack.levels.findLast(isRecognition);
  if (left.length < QUIZ_MIN && last) {
    const levels = pack.levels.map((l) => (l === last ? { ...l, questionIds: [...(l.questionIds ?? []), ...left] } : l));
    return { ...pack, levels };
  }

  const parts = Math.ceil(left.length / QUIZ_SIZE);
  const quizzes = Array.from({ length: parts }, (_, i): Omit<Level, 'id' | 'order'> => {
    const questionIds = left.slice(Math.round((i * left.length) / parts), Math.round(((i + 1) * left.length) / parts));
    return {
      topicId: pack.topicId,
      type: 'method_recognition',
      title: parts === 1 ? 'Quick quiz' : `Quick quiz ${i + 1}`,
      description: `${questionIds.length} short questions on the ideas of this topic.`,
      questionIds,
    };
  });
  const at = pack.levels.findIndex((l) => l.type === 'mixed_practice');
  const cut = at === -1 ? pack.levels.length : at;
  const own = (l: Level | Omit<Level, 'id' | 'order'>) => ('id' in l && !idByPosition(l) ? l.id : undefined);
  // A level with an id of its own keeps it and takes no place in the numbering of the others.
  let place = 0;
  const levels = [...pack.levels.slice(0, cut), ...quizzes, ...pack.levels.slice(cut)].map((l, order) => ({
    ...l,
    id: own(l) ?? `${pack.topicId}-level-${place++}`,
    order,
  }));
  return { ...pack, levels };
}

/**
 * The pack with one more level after the ones it has. The level takes the next order but an id of its own
 * (`<topicId>-<name>`), not one that follows its position: a level an author adds to the ladder later must not take
 * over the id of a level a learner has already passed.
 */
function withLevelAtEnd(pack: TopicPack, name: string, draft: Omit<Level, 'id' | 'topicId' | 'order'>): TopicPack {
  const order = pack.levels.reduce((top, l) => Math.max(top, l.order + 1), 0);
  return { ...pack, levels: [...pack.levels, { id: `${pack.topicId}-${name}`, topicId: pack.topicId, order, ...draft }] };
}

/** Every template the levels of a pack generate from, each once, in the order the levels list them. */
const generatedBy = (levels: Pick<Level, 'generate'>[]) => unique(levels.flatMap((l) => l.generate?.templateIds ?? []));

/**
 * The templates a topic gives the look-back levels of the topics after it: those its levels list, each once. Sets of
 * entries and formats are left out: a look-back is a quick round, and those are long questions. So are the
 * Assertion-Reason templates, which stand on their own levels alone (`isAssertionReason`).
 */
export const lookBackTemplates = (levels: Pick<Level, 'type' | 'generate'>[]): string[] =>
  generatedBy(levels.filter((l) => l.type !== 'set_practice' && l.type !== 'format_practice')).filter((id) => !outsidePapers(id));

/**
 * The pack with a "Look back" level after its last level: questions of the topic itself mixed with questions of the
 * topics before it (`before`, in course order, each with the templates it gives: see `lookBackTemplates`). The
 * topic's own questions come from the templates of its mixed levels, or failing that from every template its levels
 * list. A pack without levels gets no such level, nor does one with no topic before it to look back on.
 */
export function withLookBack(pack: TopicPack, before: LookBackTopic[]): TopicPack {
  if (pack.levels.length === 0 || before.length === 0) return pack;
  const mixed = generatedBy(pack.levels.filter((l) => l.type === 'mixed_practice'));
  return withLevelAtEnd(pack, 'look-back', {
    type: 'look_back',
    title: 'Look back',
    description: 'This topic mixed with questions from the topics before it, so that earlier work stays fresh.',
    lookBack: { templateIds: mixed.length > 0 ? mixed : lookBackTemplates(pack.levels), earlier: before },
  });
}

/**
 * The packs, each with its "Look back" level (see `withLookBack`). `packs` are in course order. The first topic that
 * has templates has nothing to look back on and gets no such level.
 */
export function withLookBackLevels(packs: TopicPack[], meets: (earlier: string, topicId: string) => boolean = () => true): TopicPack[] {
  const earlier: LookBackTopic[] = [];
  return packs.map((pack) => {
    // Only the topics a learner of this one also meets (not those of another choice of Part B: courseOptions.ts).
    const before = earlier.filter((e) => meets(e.topicId, pack.topicId));
    const listed = lookBackTemplates(pack.levels);
    if (listed.length > 0) earlier.push({ topicId: pack.topicId, templateIds: listed });
    return withLookBack(pack, before);
  });
}

/**
 * The packs, with a "Case study" level at the end of the topic of every stage that has cases (one for each stage, in
 * the order of `stages`, where a topic closes several), and the stage's concept among that topic's concepts (the questions of its cases belong to it, so progress, mastery and the
 * Mistakes screen treat them like any other question). A stage with no cases adds nothing; neither does one whose
 * topic has no levels.
 */
export function withCaseStudyLevels(packs: TopicPack[], stages: CaseStage[]): TopicPack[] {
  return packs.map((pack) => {
    if (pack.levels.length === 0) return pack;
    let out = pack;
    for (const stage of stages) {
      if (stage.topicId !== pack.topicId || stage.cases.length === 0) continue;
      const title = `Case study: ${stage.title}`;
      const concepts = out.concepts.some((c) => c.id === stage.conceptId)
        ? out.concepts
        : [...out.concepts, { id: stage.conceptId, topicId: pack.topicId, title }];
      // A chained case has two to five long parts, each right only when every row or entry of it is, so a stage that
      // has one passes like a format level; a stage of short questions keeps the usual pass mark.
      const long = stage.cases.some((c) => c.parts.some((p) => p.kind === 'journal_set' || p.kind === 'account' || p.kind === 'statement'));
      out = withLevelAtEnd({ ...out, concepts }, `case-study-${stage.id}`, {
        type: 'case_study',
        title,
        description: stage.description,
        cases: { caseIds: stage.cases.map((c) => c.id) },
        ...(long ? { passMark: FORMAT_PASS_MARK } : {}),
      });
    }
    return out;
  });
}
