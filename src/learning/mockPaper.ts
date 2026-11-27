import { DEFAULT_PART_B, choiceKey, partBOf, topicShown, type CourseChoice } from '@/content/courseOptions';
import { getTopicPack } from '@/content/loaded';
import { COURSES, STAGES, TEMPLATE_OUTLINES, findOutline, type StageOutline } from '@/content/outline';
import type { Course, Difficulty, Question } from '@/content/types';
import { createRng, type Rng } from '@/engine/rng';
import { outsidePapers } from '@/generators/outsidePapers';
import { generateCaseQuestions, generateQuestion } from '@/generators/loaded';
import { isFormatKind, type TemplateOutline } from '@/generators/types';
import { BLUEPRINTS, MARK_SOURCES, PAPER_KINDS, STAGES_OUTSIDE_PAPERS, blueprintsOf, needsTopic, type MarkValue, type PaperBlueprint, type PaperKind, type PaperSection } from './paperBlueprints';

// ---------------------------------------------------------------------------------------------------------------
// Which paper. A paper is a pure function of its course, its kind, its topic (a topic test) and its number: the same
// four always rebuild the same paper, so a paper that was sat can be opened again later from these alone. The
// course is that of the bank the paper is built from (a record of a sitting names it); the rest is the reference.
// ---------------------------------------------------------------------------------------------------------------

export interface PaperRef {
  kind: PaperKind;
  /** The topic of a topic test; left out for the other kinds. */
  topicId?: string;
  /** Counted from 1. */
  number: number;
  /**
   * 'computerised' for a paper set for a learner who takes Computerised Accounting as Part B of Class 12
   * (content/courseOptions.ts); left out for every other paper, which is set for the default choice.
   */
  partB?: 'computerised';
}

/** Papers of one kind are numbered 1 to this. */
export const MAX_PAPER_NUMBER = 9999;

/** What the key of a paper set for Computerised Accounting as Part B starts with. */
const CAS_PREFIX = 'cas.';

/**
 * A paper's name in storage and in addresses: `full.3`, `half.1`, `topic.ledger.2`; and for a paper set for
 * Computerised Accounting as Part B the same after `cas.` (`cas.full.3`), so that it is always rebuilt from the bank it
 * was set from, whatever the learner chooses later. Topic ids hold no dot.
 */
export const paperKey = (ref: PaperRef): string =>
  (ref.partB === 'computerised' ? CAS_PREFIX : '') + (ref.topicId === undefined ? `${ref.kind}.${ref.number}` : `${ref.kind}.${ref.topicId}.${ref.number}`);

/**
 * The paper a key names, or null for anything `paperKey` could not have written. Which kinds are set on one topic
 * is the same in every course.
 */
export function parsePaperKey(key: string): PaperRef | null {
  const cas = key.startsWith(CAS_PREFIX);
  const m = /^([a-z]+)(?:\.([a-z0-9-]+))?\.([1-9]\d{0,3})$/.exec(cas ? key.slice(CAS_PREFIX.length) : key);
  if (!m || !(PAPER_KINDS as readonly string[]).includes(m[1])) return null;
  const kind = m[1] as PaperKind;
  if (needsTopic(BLUEPRINTS[kind]) !== (m[2] !== undefined)) return null;
  const ref: PaperRef = m[2] === undefined ? { kind, number: Number(m[3]) } : { kind, topicId: m[2], number: Number(m[3]) };
  return cas ? { ...ref, partB: 'computerised' } : ref;
}

/** The choice a paper was set for: what its bank is built with (see `bankOfPaper`). */
export const choiceOfPaper = (ref: Pick<PaperRef, 'partB'>): CourseChoice => (ref.partB === 'computerised' ? { class12PartB: 'computerised' } : {});

// ---------------------------------------------------------------------------------------------------------------
// The bank a paper is assembled from.
// ---------------------------------------------------------------------------------------------------------------

export interface BankTopic {
  id: string;
  title: string;
  unit: string;
  /** Where the topic stands in the course catalogue, from 0. */
  courseIndex: number;
}

export interface PaperBank {
  /** The course the bank is of. */
  courseId: string;
  /**
   * The choice of the learners it sets papers for (Part B of Class 12): its topics are those they meet, its blueprints
   * theirs. A paper of the bank carries it in its reference (`refOfBank`). Left out: the default.
   */
  choice?: CourseChoice;
  /** The three papers of the course, by kind. */
  blueprints: Record<PaperKind, PaperBlueprint>;
  /** The playable topics, in course order. */
  topics: BankTopic[];
  /**
   * Their templates, in outline: a paper chooses among them before it makes a question. None beyond the syllabus, and
   * no Assertion-Reason template (`isAssertionReason`): those stand on their own levels, and leaving them out keeps
   * every paper as it was.
   */
  templates: TemplateOutline[];
  /** The authored questions of one topic of the bank. Of the bank of a course, the topic must have been loaded. */
  questionsOf(topicId: string): Question[];
  /** The stages of case studies, their cases in outline. None of `STAGES_OUTSIDE_PAPERS`. */
  stages: StageOutline[];
}

/**
 * The bank of a course: its playable topics, every template and authored question of theirs (but those beyond the
 * syllabus), and the case stages (but those that stay outside the papers).
 * Everything but the authored questions is known from the outline, so the bank can be listed (the topics of a paper,
 * its title) while no topic is loaded; building a paper needs the topics it draws on (`paperTopics`).
 */
export function courseBank(course: Course, choice: CourseChoice = {}): PaperBank {
  // A topic keeps its place in the whole catalogue, whatever the choice, so a topic test has the same seeds for all.
  const topics = course.topics.flatMap((t, courseIndex) => (findOutline(t.id) && topicShown(t.id, choice) ? [{ id: t.id, title: t.title, unit: t.unit, courseIndex }] : []));
  const ids = new Set(topics.map((t) => t.id));
  return {
    courseId: course.id,
    choice: partBOf(choice) === DEFAULT_PART_B ? {} : { class12PartB: partBOf(choice) },
    blueprints: blueprintsOf(course.id, choice),
    topics,
    // A paper is set in the board's pattern: nothing that teaches beyond the syllabus is set in it. Nor are the
    // Assertion and Reason banks, which were added after papers had been sat: they would move every paper.
    templates: TEMPLATE_OUTLINES.filter((t) => ids.has(t.topicId) && t.beyondSyllabus === undefined && !outsidePapers(t.id)),
    questionsOf: (topicId) => (ids.has(topicId) ? (getTopicPack(topicId)?.questions ?? []).filter((q) => q.beyondSyllabus === undefined && !outsidePapers(q.id)) : []),
    stages: STAGES.filter((s) => ids.has(s.topicId) && !STAGES_OUTSIDE_PAPERS.includes(s.id)),
  };
}

// The bank of every course, built once for the outline it was built from (a new outline is a new list of courses).
let banksFor: unknown;
let banks = new Map<string, PaperBank>();

/**
 * The bank of a course: the one a learner of that course, with this choice of its options (Part B of Class 12), is
 * set papers from; without a choice, the default's. A course this version does not have has an empty bank, from
 * which no paper can be built.
 */
export function bankOf(courseId: string, choice?: CourseChoice | null): PaperBank {
  if (banksFor !== COURSES) {
    banksFor = COURSES;
    banks = new Map();
  }
  const key = `${courseId}|${choiceKey(choice)}`;
  let bank = banks.get(key);
  if (!bank) {
    const course = COURSES.find((c) => c.id === courseId);
    bank = course ? courseBank(course, choice ?? {}) : { courseId, choice: {}, blueprints: blueprintsOf(courseId), topics: [], templates: [], questionsOf: () => [], stages: [] };
    banks.set(key, bank);
  }
  return bank;
}

/** The bank a paper was set from: that of its course and of the choice its reference carries. */
export const bankOfPaper = (courseId: string, ref: Pick<PaperRef, 'partB'>): PaperBank => bankOf(courseId, choiceOfPaper(ref));

/** A reference to a paper of this bank: it carries the bank's choice, so that the paper is rebuilt from this bank. */
export const refOfBank = (bank: PaperBank, ref: Omit<PaperRef, 'partB'>): PaperRef =>
  partBOf(bank.choice) === 'computerised' ? { ...ref, partB: 'computerised' } : ref;

/** The bank of the course a new learner joins. */
export const theBank = (): PaperBank => bankOf(COURSES[0].id);

/**
 * True when a kind of paper can be set from a bank: every section of its blueprint has a topic to draw on. While a
 * course is still being written a unit may have no topic that can be played yet, and its full paper waits for it.
 */
export const paperAvailable = (kind: PaperKind, bank: PaperBank): boolean =>
  bank.blueprints[kind].sections.every((section) => ('chosen' in section.topics ? bank.topics.length > 0 : sectionTopics(section, bank, {}).length > 0));

// ---------------------------------------------------------------------------------------------------------------
// Seeds. Levels stay below 1,000,000,000, practice sessions sit in the 1,000,000,000s and the daily challenge in the
// 2,000,000,000s (see practice.ts). Mock papers take the 3,000,000,000s: each paper owns a block of 100 seeds.
// ---------------------------------------------------------------------------------------------------------------

export const MOCK_SEED_BASE = 3_000_000_000;
const SLOTS_PER_PAPER = 100;
const PAPERS_PER_SLOT = MAX_PAPER_NUMBER + 1;
/** Written out, never derived from list order, so adding a kind cannot move one. A topic test adds its topic's place in the course. */
const KIND_SLOT: Record<PaperKind, number> = { full: 0, half: 1, topic: 2 };
// Keeps the stream that deals the questions apart from the streams of the questions themselves.
const DEAL_SALT = 0x7f4a7c15;

/** The first seed of a paper's block. Throws for a paper that cannot exist (a bad number, an unknown topic). */
export function paperSeed(ref: PaperRef, bank: PaperBank = theBank()): number {
  if (!Number.isInteger(ref.number) || ref.number < 1 || ref.number > MAX_PAPER_NUMBER) throw new Error(`Invalid paper number: ${ref.number}`);
  if (!Object.hasOwn(KIND_SLOT, ref.kind)) throw new Error(`Unknown kind of paper: ${ref.kind}`);
  let slot = KIND_SLOT[ref.kind];
  if (needsTopic(bank.blueprints[ref.kind])) {
    const topic = bank.topics.find((t) => t.id === ref.topicId);
    if (!topic) throw new Error(`Unknown topic for a paper: ${ref.topicId}`);
    slot += topic.courseIndex;
  } else if (ref.topicId !== undefined) {
    throw new Error(`A ${ref.kind} paper has no topic`);
  }
  return MOCK_SEED_BASE + (slot * PAPERS_PER_SLOT + ref.number) * SLOTS_PER_PAPER;
}

// ---------------------------------------------------------------------------------------------------------------
// The paper.
// ---------------------------------------------------------------------------------------------------------------

/** One numbered question of a paper. A case study is one question whose parts are (a), (b), ... */
export interface PaperEntry {
  /** Counted from 1 over the whole paper. */
  number: number;
  marks: MarkValue;
  /** The part of the paper it is printed in, when the paper has parts. */
  part?: string;
  /** The section of the blueprint it was set for, from 0. */
  section: number;
  topicId: string;
  /** For a case study: the case, and its title. */
  caseId?: string;
  caseTitle?: string;
  /** One question; for a case study every question of the case, in order. */
  questions: Question[];
}

export interface MockPaper {
  ref: PaperRef;
  key: string;
  title: string;
  marks: number;
  minutes: number;
  blueprint: PaperBlueprint;
  entries: PaperEntry[];
}

/** One thing the learner answers: a question of the paper, or one part of a case. */
export interface PaperStep {
  /** Position among the steps, from 0. */
  index: number;
  entry: PaperEntry;
  question: Question;
  /** "12" for a question, "31(a)" for a part of a case. */
  label: string;
  /** For a part of a case: its position in the case, from 0. */
  part?: number;
}

/** Everything the learner answers, in the order of the paper. */
export function paperSteps(paper: MockPaper): PaperStep[] {
  const steps: PaperStep[] = [];
  for (const entry of paper.entries) {
    entry.questions.forEach((question, i) => {
      const isCase = entry.caseId !== undefined;
      steps.push({
        index: steps.length,
        entry,
        question,
        label: isCase ? `${entry.number}(${String.fromCharCode(97 + i)})` : String(entry.number),
        ...(isCase ? { part: i } : {}),
      });
    });
  }
  return steps;
}

/**
 * The marks a case earns: its marks shared equally among its questions, to the nearest half mark. A set of journal
 * entries is marked the same way, its marks shared among its entries, and so is a format, its marks shared among its
 * rows: marks times rows counted, divided by the rows expected. The rows counted are the rows that are right less one
 * for every extra row (see `rowsCounted`), so a row that should not be there cancels a right one and no more.
 */
export function caseMarks(marks: number, right: number, questions: number): number {
  if (questions <= 0) return 0;
  return Math.round(((marks * right) / questions) * 2) / 2;
}

/** What one part of a case earns of its share of the marks: `right` of `total`, a credit from 0 to 1. */
export interface Credit {
  right: number;
  total: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * The marks a case earns from the credit of each of its parts: its marks times the average credit, to the nearest
 * half mark (a quarter goes up). Every part weighs the same, however many rows or entries it has. A short part is 1
 * of 1 or 0 of 1, so a case of short questions earns what `caseMarks` gives it; a long part of a chained case (a
 * format or a set of entries) earns its share row by row. The sum is kept as a fraction, so that a half mark never
 * turns on how a computer writes a third.
 */
export function creditMarks(marks: number, credits: readonly Credit[]): number {
  if (credits.length === 0) return 0;
  // The sum of the credits as one fraction in its lowest terms.
  let [top, bottom] = [0, 1];
  for (const { right, total } of credits) {
    if (total <= 0) continue;
    [top, bottom] = [top * total + Math.min(Math.max(0, right), total) * bottom, bottom * total];
    const shared = gcd(top, bottom);
    [top, bottom] = [top / shared, bottom / shared];
  }
  // Half marks earned = 2 x marks x sum / parts, rounded to the nearest whole one.
  const parts = credits.length * bottom;
  return Math.floor((4 * marks * top + parts) / (2 * parts)) / 2;
}

/** The topics a section draws on, in course order. */
export function sectionTopics(section: PaperSection, bank: PaperBank, ref: Pick<PaperRef, 'topicId'>): BankTopic[] {
  const { topics } = section;
  if ('unit' in topics) return bank.topics.filter((t) => t.unit === topics.unit);
  if ('first' in topics) return bank.topics.slice(0, topics.first);
  return bank.topics.filter((t) => t.id === ref.topicId);
}

/**
 * The topics a paper draws on, in course order: those of every section of its blueprint. They are the topics to load
 * before the paper is built (see content/loadTopics.ts).
 */
export function paperTopics(ref: PaperRef, bank: PaperBank = theBank()): string[] {
  const ids = new Set(bank.blueprints[ref.kind].sections.flatMap((section) => sectionTopics(section, bank, ref).map((t) => t.id)));
  return bank.topics.filter((t) => ids.has(t.id)).map((t) => t.id);
}

export function paperTitle(ref: PaperRef, bank: PaperBank = theBank()): string {
  const base = `${bank.blueprints[ref.kind].title} ${ref.number}`;
  const topic = ref.topicId === undefined ? undefined : bank.topics.find((t) => t.id === ref.topicId);
  return topic ? `${base}: ${topic.title}` : base;
}

/** Something a question can be made from: a template, or an authored question. */
type Source = { id: string; template: TemplateOutline } | { id: string; question: Question };

type Tiers = readonly (readonly Difficulty[])[];
/** For each mark value dealt from the bank: the difficulties to take, the first group a topic has anything of. */
const TIERS: Record<1 | 3 | 4, Tiers> = {
  1: [MARK_SOURCES[1].difficulties],
  3: MARK_SOURCES[3].difficulties.map((d) => [d]),
  4: MARK_SOURCES[4].difficulties.map((d) => [d]),
};

/** What a topic has for each mark value dealt from the bank, and its sets of entries and formats that are 6-mark questions. */
type TopicSources = Record<1 | 3 | 4, Source[][]> & { sets6: Source[] };

/** What each of these topics has for each mark value, grouped once per paper. */
function sourcesByTopic(bank: PaperBank, topicIds: readonly string[]): Map<string, TopicSources> {
  const out = new Map<string, TopicSources>();
  for (const topicId of topicIds) {
    const templates = bank.templates.filter((t) => t.topicId === topicId);
    const questions = bank.questionsOf(topicId);
    /** The sets of entries of one difficulty: the questions of the mark value that names it (see `MARK_SOURCES`). */
    const sets = (difficulty: Difficulty): Source[] =>
      templates.filter((t) => t.kind === 'journal_set' && t.difficulty === difficulty).map((template) => ({ id: template.id, template }));
    /** The formats of some difficulties: they stand wherever the sets of the same mark value do. */
    const formats = (difficulties: readonly Difficulty[]): Source[] =>
      templates.filter((t) => isFormatKind(t.kind) && difficulties.includes(t.difficulty)).map((template) => ({ id: template.id, template }));
    const forMarks = (marks: 1 | 3 | 4): Source[][] => {
      const source = MARK_SOURCES[marks];
      return TIERS[marks].map((difficulties, tier) => [
        ...templates
          .filter((t) => (source.templateKinds as readonly string[]).includes(t.kind) && difficulties.includes(t.difficulty))
          .map((template) => ({ id: template.id, template })),
        // A set stands with the worked questions of the first difficulty.
        ...('sets' in source && tier === 0 ? sets(source.sets) : []),
        ...('formats' in source && tier === 0 ? formats(source.formats) : []),
        ...questions
          .filter((q) => (source.questionTypes as readonly string[]).includes(q.type) && difficulties.includes(q.difficulty))
          .map((question) => ({ id: question.id, question })),
      ]);
    };
    out.set(topicId, { 1: forMarks(1), 3: forMarks(3), 4: forMarks(4), sets6: [...sets(MARK_SOURCES[6].sets), ...formats(MARK_SOURCES[6].formats)] });
  }
  return out;
}

/** One of the items, each as likely as its weight is large. */
function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  let r = rng.next() * items.reduce((sum, item) => sum + weight(item), 0);
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

/**
 * The order in which the stages of a section (those that have cases, in the order of CASE_STAGES) take the section's
 * 6-mark turns on a paper: round the list from a stage drawn for the paper. On a paper whose number is not a multiple
 * of three the stages the blueprint favours go first, then the others from the stage drawn, those of a topic that a
 * favoured stage already speaks for last of all (a paper sets no two cases of one topic while it has others to set).
 * One draw is made whenever there is a stage, so a stage that has no case yet, and is not among them, changes nothing.
 */
export function caseTurns<S extends { id: string; topicId: string }>(stages: readonly S[], blueprint: Pick<PaperBlueprint, 'favouredStages'>, number: number, rng: Rng): S[] {
  if (stages.length === 0) return [];
  const start = rng.int(0, stages.length - 1);
  const turns = [...stages.slice(start), ...stages.slice(0, start)];
  const favoured = new Set(blueprint.favouredStages ?? []);
  const first = stages.filter((s) => favoured.has(s.id));
  if (first.length === 0 || number % 3 === 0) return turns;
  const spokenFor = new Set(first.map((s) => s.topicId));
  const others = turns.filter((s) => !favoured.has(s.id));
  return [...first, ...others.filter((s) => !spokenFor.has(s.topicId)), ...others.filter((s) => spokenFor.has(s.topicId))];
}

/**
 * The paper a reference names, assembled from the bank after the blueprint of its kind.
 *
 * Section by section: first the 6-mark questions. They are case studies, one from each stage of the section's topics
 * that has cases, in turn (see `caseTurns`; a topic may close several stages), except that in a section with several
 * the last is a set of journal entries ("Journalise the following transactions") of one of the section's topics, when
 * one has such a set: the stage whose turn it would have been waits for another paper. A turn with no case to give
 * (no stage of the section has cases, or its cases are used) also gives a set, and when there is none two 3-mark
 * questions instead. A topic gives at most one 6-mark set to a paper. Then the 1-, 3- and 4-mark questions, each
 * dealt to a topic and then drawn from what that topic has for the mark value. A topic gets no further question until
 * every topic of the section that still has something to give has had as many (a case counts as one), and among
 * those level the topic with more to give is the more likely. No template, authored question or case appears twice in a paper. On the
 * paper the questions stand as in the examination: part by part, and within a part by marks, 1 first.
 *
 * Throws for a paper that cannot exist, or when the bank has too little for the blueprint.
 */
export function buildPaper(ref: PaperRef, bank: PaperBank = theBank()): MockPaper {
  // A paper is rebuilt from the bank of the choice it was set for (`bankOfPaper`), never from another.
  if ((ref.partB === 'computerised') !== (partBOf(bank.choice) === 'computerised')) throw new Error(`The paper ${paperKey(ref)} is not of this bank`);
  const blueprint = bank.blueprints[ref.kind];
  const seedBase = paperSeed(ref, bank);
  const rng = createRng(seedBase ^ DEAL_SALT);
  let slot = 0;
  const nextSeed = () => {
    if (slot >= SLOTS_PER_PAPER) throw new Error('A paper needs more seeds than its block holds');
    return seedBase + slot++;
  };
  // Only the topics of the paper are looked into: of the bank of a course, they are the ones that must be loaded.
  const sources = sourcesByTopic(bank, paperTopics(ref, bank));
  const used = new Set<string>();
  /** The topics that have given the paper a 6-mark set of entries. */
  const gaveSet = new Set<string>();
  const parts = [...new Set(blueprint.sections.map((s) => s.part))];
  const dealt: (Omit<PaperEntry, 'number'> & { order: number })[] = [];
  const add = (entry: Omit<PaperEntry, 'number'>) => dealt.push({ ...entry, order: dealt.length });

  blueprint.sections.forEach((section, index) => {
    const topics = sectionTopics(section, bank, ref);
    if (topics.length === 0) throw new Error(`No topic for the section "${section.title}"`);
    const had = new Map(topics.map((t) => [t.id, 0]));
    const part = section.part === undefined ? {} : { part: section.part };

    // Case studies: the stages of the section's topics take turns (every stage of a topic that closes several),
    // starting from one drawn for this paper; a favoured stage goes first on two papers of three. Papers that follow
    // one another take the cases of a stage in turn too. A stage with no case is never drawn.
    const stages = caseTurns(bank.stages.filter((s) => had.has(s.topicId) && s.cases.length > 0), blueprint, ref.number, rng);
    const { fallback } = MARK_SOURCES[6];
    let instead = 0;
    /**
     * A long set of entries as a 6-mark question, from a topic of the section that has had the fewest questions and
     * has given the paper no such set yet. False when no topic has one to give.
     */
    const addSet = (): boolean => {
      const open = topics.flatMap((t) => {
        const pool = gaveSet.has(t.id) ? [] : sources.get(t.id)!.sets6.filter((s) => !used.has(s.id));
        return pool.length > 0 ? [{ topicId: t.id, pool }] : [];
      });
      if (open.length === 0) return false;
      const fewest = Math.min(...open.map((o) => had.get(o.topicId)!));
      const { topicId, pool } = rng.pick(open.filter((o) => had.get(o.topicId) === fewest));
      const source = rng.pick(pool);
      used.add(source.id);
      gaveSet.add(topicId);
      had.set(topicId, had.get(topicId)! + 1);
      add({ marks: 6, ...part, section: index, topicId, questions: [generateQuestion(source.id, nextSeed())] });
      return true;
    };
    for (let i = 0; i < section.questions[6]; i++) {
      const stage = stages.length > 0 ? stages[i % stages.length] : undefined;
      const round = stages.length > 0 ? Math.floor(i / stages.length) : 0;
      const template = stage && stage.cases.length > 0 ? stage.cases[(ref.number - 1 + round) % stage.cases.length] : undefined;
      const hasCase = stage !== undefined && template !== undefined && !used.has(template.id);
      // The last of several 6-mark questions is a set of entries, and so is one whose stage has no case to give.
      const setsTurn = section.questions[6] > 1 && i === section.questions[6] - 1;
      if ((setsTurn || !hasCase) && addSet()) continue;
      if (!stage || !template || !hasCase) {
        instead += fallback.count;
        continue;
      }
      used.add(template.id);
      had.set(stage.topicId, had.get(stage.topicId)! + 1);
      add({
        marks: 6,
        ...part,
        section: index,
        topicId: stage.topicId,
        caseId: template.id,
        caseTitle: template.title,
        questions: generateCaseQuestions(template.id, nextSeed()),
      });
    }

    for (const marks of [1, 3, 4] as const) {
      const count = section.questions[marks] + (marks === fallback.marks ? instead : 0);
      for (let i = 0; i < count; i++) {
        // What each topic can still give for this mark value: the first difficulty group with anything unused.
        const open = topics.flatMap((t) => {
          const pool = sources.get(t.id)![marks].map((tier) => tier.filter((s) => !used.has(s.id))).find((tier) => tier.length > 0);
          return pool ? [{ topicId: t.id, pool }] : [];
        });
        if (open.length === 0) throw new Error(`The bank has no ${marks}-mark question left for "${section.title}"`);
        const fewest = Math.min(...open.map((o) => had.get(o.topicId)!));
        const { topicId, pool } = pickWeighted(rng, open.filter((o) => had.get(o.topicId) === fewest), (o) => o.pool.length);
        const source = rng.pick(pool);
        used.add(source.id);
        had.set(topicId, had.get(topicId)! + 1);
        const question = 'template' in source ? generateQuestion(source.template.id, nextSeed()) : source.question;
        add({ marks, ...part, section: index, topicId, questions: [question] });
      }
    }
  });

  const entries = dealt
    .sort((a, b) => parts.indexOf(a.part) - parts.indexOf(b.part) || a.marks - b.marks || a.section - b.section || a.order - b.order)
    .map((entry, i): PaperEntry => {
      const { marks, part, section, topicId, caseId, caseTitle, questions } = entry;
      return {
        number: i + 1,
        marks,
        ...(part === undefined ? {} : { part }),
        section,
        topicId,
        ...(caseId === undefined ? {} : { caseId, caseTitle }),
        questions,
      };
    });

  return {
    ref,
    key: paperKey(ref),
    title: paperTitle(ref, bank),
    marks: blueprint.marks,
    minutes: blueprint.minutes,
    blueprint,
    entries,
  };
}
