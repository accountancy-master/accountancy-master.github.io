import type { CaseStage } from '@/generators/cases';
import { casePartId, genId, parseCasePartId, parseGenId } from '@/generators/ids';
import type { CaseOutline, Template, TemplateOutline } from '@/generators/types';
import { simTopicOf } from '@/simulator/ids';
import { COURSE_CATALOGUES } from './courses';
import { choiceKey, topicShown, type CourseChoice } from './courseOptions';
import { OUTLINE } from './outline.generated';
import type { Course, Difficulty, LevelOutline, LevelType, Question, TopicOutline } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The outline of every course: every playable topic with its concepts, levels and the ids of what it holds, every
// template and every case study by what can be known without it. A learner is on one course at a time, so a screen
// asks for the topics and stages of that course (`outlinesOf`, `stagesOf`); what is looked up by an id (a topic, a
// template, a question) is found whatever course it belongs to, since no id is used by two courses. It is generated from the packs and the generators
// (`npm run catalogue`, see catalogueSource.ts), so the screens that list things read it and import no pack and no
// generator. What is played is loaded topic by topic (loadTopics.ts) and looked up in loaded.ts.
// ---------------------------------------------------------------------------------------------------------------

/** The generated data, in rows: `renderOutline` (catalogueSource.ts) writes it and this file reads it. */
export interface OutlineData {
  /** The playable topics, in course order. */
  topics: {
    id: string;
    /** id, title */
    concepts: [string, string][];
    /** id, concept; and why, for a card beyond the syllabus */
    cards: ([string, string] | [string, string, string])[];
    /**
     * id, concept, difficulty, type; and `true` after them for a question that carries a case text. A question beyond
     * the syllabus has two more: whether it carries a case text, and why it is beyond the syllabus.
     */
    questions: (
      | [string, string, Difficulty, Question['type']]
      | [string, string, Difficulty, Question['type'], true]
      | [string, string, Difficulty, Question['type'], boolean, string]
    )[];
    /**
     * id, version, concept, difficulty, kind: the topic's templates in the order of the generator registry; and for a
     * template beyond the syllabus, why it is.
     */
    templates: ([string, number, string, Difficulty, Template['kind']] | [string, number, string, Difficulty, Template['kind'], string])[];
    levels: {
      id: string;
      order: number;
      type: LevelType;
      title: string;
      /** The questions its lesson checks. */
      checks?: string[];
      questionIds?: string[];
      generate?: { templateIds: string[]; count: number };
      cases?: { caseIds: string[] };
    }[];
  }[];
  /** The stages of case studies, in the order a student meets them. */
  stages: {
    id: string;
    topicId: string;
    conceptId: string;
    title: string;
    description: string;
    /** id, version, difficulty, title, the kind of each question */
    cases: [string, number, Difficulty, string, Template['kind'][]][];
  }[];
}

/** A stage of case studies with its cases in outline. Every `CaseStage` is one. */
export type StageOutline = Omit<CaseStage, 'cases'> & { cases: CaseOutline[] };

/** The playable topics of every course, in course order: what `PACKS` is in the registry, in outline. */
export let OUTLINES: TopicOutline[] = [];
/** Every template, in the order of the generator registry within its topic. A part of a case is not among them. */
export let TEMPLATE_OUTLINES: TemplateOutline[] = [];
/** The stages of case studies of every course, in the order a student meets them. */
export let STAGES: StageOutline[] = [];
export let COURSES: Course[] = [];

let sizes: OutlineData['topics'] = [];
let caseById: ReadonlyMap<string, CaseOutline> = new Map();
let templateById: ReadonlyMap<string, TemplateOutline> = new Map();
let templatesByConcept: ReadonlyMap<string, TemplateOutline[]> = new Map();
let topicOfAuthored: ReadonlyMap<string, string> = new Map();
let topicOfLevelId: ReadonlyMap<string, string> = new Map();
let courseOfTopicId: ReadonlyMap<string, string> = new Map();
let outlinesByCourse: ReadonlyMap<string, TopicOutline[]> = new Map();
let stagesByCourse: ReadonlyMap<string, StageOutline[]> = new Map();
let templatesByCourse: ReadonlyMap<string, TemplateOutline[]> = new Map();
let conceptTitles: ReadonlyMap<string, string> = new Map();
let topicTitles: ReadonlyMap<string, string> = new Map();
/** The lists of a course as a learner with a choice has them (see `viewOf`), worked out once for each outline. */
const views = new Map<string, unknown[]>();

/**
 * A topic that can be played is available whatever the catalogue says; one that cannot keeps the status the
 * catalogue gives it ("Coming soon", "Planned").
 */
const withAvailability = (course: Course): Course => ({
  ...course,
  topics: course.topics.map((t) => (OUTLINES.some((o) => o.topicId === t.id) ? { ...t, status: 'available' } : t)),
});

/**
 * Sets the outline everything below answers from. The app keeps the generated one. The registry, which has every
 * pack and generator in memory (unit tests and scripts), puts the outline of exactly what it holds in its place, so
 * that there the two can never disagree; a unit test checks that the generated file says the same. `catalogues` are
 * the courses the topics belong to: the app's own, unless a test brings a course of its own.
 */
export function installOutline(data: OutlineData, catalogues: readonly Course[] = COURSE_CATALOGUES): void {
  sizes = data.topics;
  views.clear();
  OUTLINES = data.topics.map((t) => ({
    topicId: t.id,
    concepts: t.concepts.map(([id, title]) => ({ id, topicId: t.id, title })),
    cards: t.cards.map(([id, conceptId, beyond]) => ({ id, topicId: t.id, conceptId, ...(beyond !== undefined ? { beyondSyllabus: beyond } : {}) })),
    levels: t.levels.map(
      ({ checks, ...level }): LevelOutline => ({
        ...level,
        topicId: t.id,
        ...(checks ? { lesson: checks.map((questionId) => ({ type: 'check', questionId })) } : {}),
      }),
    ),
    // The case text itself is not kept: that there is one is all a list needs to know.
    questions: t.questions.map(([id, conceptId, difficulty, type, inCase, beyond]) => ({
      id,
      topicId: t.id,
      conceptId,
      difficulty,
      type,
      ...(inCase ? { context: '' } : {}),
      ...(beyond !== undefined ? { beyondSyllabus: beyond } : {}),
    })),
  }));
  TEMPLATE_OUTLINES = data.topics.flatMap((t) =>
    t.templates.map(([id, version, conceptId, difficulty, kind, beyond]) => ({
      id,
      version,
      topicId: t.id,
      conceptId,
      difficulty,
      kind,
      ...(beyond !== undefined ? { beyondSyllabus: beyond } : {}),
    })),
  );
  STAGES = data.stages.map((s) => ({
    ...s,
    cases: s.cases.map(([id, version, difficulty, title, kinds]) => ({
      id,
      version,
      topicId: s.topicId,
      conceptId: s.conceptId,
      difficulty,
      title,
      parts: kinds.map((kind) => ({ kind })),
    })),
  }));
  COURSES = catalogues.map(withAvailability);
  // A learner sees one course: its playable topics, their templates and the stages that end on one of them.
  courseOfTopicId = new Map(COURSES.flatMap((c) => c.topics.map((t) => [t.id, c.id] as const)));
  topicTitles = new Map(COURSES.flatMap((c) => c.topics.map((t) => [t.id, t.title] as const)));
  const ofCourse = <T extends { topicId: string }>(list: readonly T[]): ReadonlyMap<string, T[]> =>
    new Map(COURSES.map((c) => [c.id, list.filter((x) => courseOfTopicId.get(x.topicId) === c.id)]));
  outlinesByCourse = ofCourse(OUTLINES);
  stagesByCourse = ofCourse(STAGES);
  templatesByCourse = ofCourse(TEMPLATE_OUTLINES);
  conceptTitles = new Map(OUTLINES.flatMap((o) => o.concepts.map((c) => [c.id, c.title] as const)));

  // Looked up for every stored question id, so indexed once. The template of one question of a case (`<caseId>~<n>`)
  // is among them: it has the version, topic, concept and difficulty of its case.
  const allCases = STAGES.flatMap((s) => s.cases);
  caseById = new Map(allCases.map((c) => [c.id, c]));
  const parts = allCases.flatMap((c) =>
    c.parts.map(({ kind }, i): TemplateOutline => ({ id: casePartId(c.id, i), version: c.version, topicId: c.topicId, conceptId: c.conceptId, difficulty: c.difficulty, kind })),
  );
  templateById = new Map([...TEMPLATE_OUTLINES, ...parts].map((t) => [t.id, t]));
  const byConcept = new Map<string, TemplateOutline[]>();
  for (const t of TEMPLATE_OUTLINES) byConcept.set(t.conceptId, [...(byConcept.get(t.conceptId) ?? []), t]);
  templatesByConcept = byConcept;
  topicOfAuthored = new Map(OUTLINES.flatMap((o) => o.questions.map((q) => [q.id, o.topicId] as const)));
  topicOfLevelId = new Map(OUTLINES.flatMap((o) => o.levels.map((l) => [l.id, o.topicId] as const)));
}

installOutline(OUTLINE);

export const findOutline = (topicId: string): TopicOutline | undefined => OUTLINES.find((o) => o.topicId === topicId);

// One list for every course that is not known, so that a screen which asks again gets the list it had.
const NO_OUTLINES: TopicOutline[] = [];
const NO_STAGES: StageOutline[] = [];
const NO_TEMPLATES: TemplateOutline[] = [];

/** The course a topic belongs to, or undefined for a topic of no course. */
export const courseOfTopic = (topicId: string): string | undefined => courseOfTopicId.get(topicId);

// A learner's view of a course: the lists above, less the topics of the option the learner has not chosen (Part B of
// Class 12, courseOptions.ts). Kept per course and choice, so that a screen that asks again gets the list it had.
function viewOf<T extends { topicId: string }>(kind: string, courseId: string, all: T[], choice: CourseChoice): T[] {
  const key = `${kind}|${courseId}|${choiceKey(choice)}`;
  let list = views.get(key) as T[] | undefined;
  if (!list) {
    list = all.filter((x) => topicShown(x.topicId, choice));
    // The default choice shows what was always shown: the very list, when nothing in it gives way.
    if (list.length === all.length) list = all;
    views.set(key, list);
  }
  return list;
}

/**
 * The playable topics of one course, in its order. With a learner's `choice` (a profile is one), the topics that
 * learner meets: those of the option of Part B not chosen are left out (courseOptions.ts); without one, every
 * playable topic of the catalogue, as scripts and tests want it. None for an unknown course.
 */
export const outlinesOf = (courseId: string, choice?: CourseChoice | null): TopicOutline[] => {
  const all = outlinesByCourse.get(courseId) ?? NO_OUTLINES;
  return choice == null ? all : viewOf('outlines', courseId, all, choice);
};

/**
 * The stages of case studies of one course, in the order a student meets them: a topic may close several. A stage
 * that has no case yet is among them, with no cases; whatever is shown keeps the stages that have some
 * (`stagesWithCases` in learning/caseStudies.ts). With a learner's `choice`, only the stages of the topics they meet.
 */
export const stagesOf = (courseId: string, choice?: CourseChoice | null): StageOutline[] => {
  const all = stagesByCourse.get(courseId) ?? NO_STAGES;
  return choice == null ? all : viewOf('stages', courseId, all, choice);
};

/**
 * The templates of one course, in the order of the generator registry within each topic. With a learner's `choice`,
 * only those of the topics they meet.
 */
export const templateOutlinesOf = (courseId: string, choice?: CourseChoice | null): TemplateOutline[] => {
  const all = templatesByCourse.get(courseId) ?? NO_TEMPLATES;
  return choice == null ? all : viewOf('templates', courseId, all, choice);
};

/**
 * A course as a learner with this choice has it: its catalogue less the topics of the option not chosen. Every
 * screen that lists the topics of the learner's course (Topics, What's inside, the maps, the worksheets) reads this.
 */
export function courseFor(courseId: string, choice: CourseChoice | null | undefined): Course | undefined {
  const course = findCourse(courseId);
  if (!course) return undefined;
  const topics = course.topics.filter((t) => topicShown(t.id, choice));
  return topics.length === course.topics.length ? course : { ...course, topics };
}

/**
 * The courses a learner can be on: those with at least one topic that can be played, in the order of the catalogues.
 * A course is offered as a choice only once there are two of them.
 */
export const playableCourses = (): Course[] => COURSES.filter((c) => outlinesOf(c.id).length > 0);

/** What a concept of a playable topic is called; undefined for a concept that is not known. */
export const findConceptTitle = (conceptId: string): string | undefined => conceptTitles.get(conceptId);

/** What a topic is called in its course catalogue; its id for a topic of no course. */
export const topicTitle = (topicId: string): string => topicTitles.get(topicId) ?? topicId;

/** Non-throwing lookup of a case study, for ids that come from stored data. */
export const findCaseOutline = (id: string): CaseOutline | undefined => caseById.get(id);

/** Non-throwing lookup of a template (also of one question of a case), for ids that come from stored data. */
export const findTemplateOutline = (id: string): TemplateOutline | undefined => templateById.get(id);

/** The templates of a concept, in registry order. Practice asks for every concept of every topic. */
export const templatesForConcept = (conceptId: string): TemplateOutline[] => [...(templatesByConcept.get(conceptId) ?? [])];

/**
 * The topic a stored question id belongs to, which is the topic to load before the question can be looked up: an
 * authored question's own, and for a generated one (`gen:<template>:<version>:<seed>`) its template's. Undefined for
 * an id this version cannot serve: unknown, malformed, or of a template version that has been retired.
 */
export function topicOfQuestion(id: string): string | undefined {
  // A prediction or a found mistake of the simulator: the topic whose content makes it again (simulator/ids.ts).
  if (id.startsWith('sim:')) return simTopicOf(id);
  const gen = parseGenId(id);
  if (!gen) return topicOfAuthored.get(id);
  const t = findTemplateOutline(gen.templateId);
  // The id must be exactly the one the question carries ('gen:x:1:007' would otherwise answer for 'gen:x:1:7').
  return t && t.version === gen.version && genId(t, gen.seed) === id ? t.topicId : undefined;
}

/** The topics the questions belong to, each once, in course order. Ids this version cannot serve name none. */
export function topicsOfQuestions(ids: Iterable<string>): string[] {
  const found = new Set<string>();
  for (const id of ids) {
    const topicId = topicOfQuestion(id);
    if (topicId !== undefined) found.add(topicId);
  }
  return OUTLINES.filter((o) => found.has(o.topicId)).map((o) => o.topicId);
}

/**
 * Why a question teaches beyond the syllabus of its course, or undefined for one within it: an authored question
 * carries the reason itself, a generated one has its template's (see `TemplateBase.beyondSyllabus`).
 */
export function beyondSyllabusOf(question: Pick<Question, 'id' | 'beyondSyllabus'>): string | undefined {
  if (question.beyondSyllabus !== undefined) return question.beyondSyllabus;
  const gen = parseGenId(question.id);
  return gen ? findTemplateOutline(gen.templateId)?.beyondSyllabus : undefined;
}

/** The case a stored question id is a question of, or undefined for any other question. */
export const caseOfQuestion = (id: string): CaseOutline | undefined => findCaseOutline(parseCasePartId(parseGenId(id)?.templateId ?? '')?.caseId ?? '');

/** The topic a level belongs to, or undefined for a level that does not exist. */
export const topicOfLevel = (levelId: string): string | undefined => topicOfLevelId.get(levelId);

/** Non-throwing lookup, for ids that come from stored data. */
export const findCourse = (id: string): Course | undefined => COURSES.find((x) => x.id === id);

/** How big a topic's bank is. */
export interface TopicSize {
  generators: number;
  /** Case studies: each is a generator of a whole case. */
  cases: number;
  questions: number;
  cards: number;
}

/**
 * How big a topic's bank is: its generators (templates), the case studies played at its end, its authored questions
 * and its rule cards. Zero for a topic that cannot be played.
 */
export function topicSize(topicId: string): TopicSize {
  const topic = sizes.find((t) => t.id === topicId);
  return {
    generators: topic?.templates.length ?? 0,
    cases: topic ? STAGES.filter((s) => s.topicId === topicId).reduce((n, s) => n + s.cases.length, 0) : 0,
    questions: topic?.questions.length ?? 0,
    cards: topic?.cards.length ?? 0,
  };
}
