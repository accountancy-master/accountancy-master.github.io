import { COURSES, findConceptTitle, stagesOf, templatesForConcept, templateOutlinesOf, topicTitle } from '@/content/outline';
import { choiceKey, topicShown, type CourseChoice } from '@/content/courseOptions';
import type { Difficulty } from '@/content/types';
import type { Template, TemplateOutline } from '@/generators/types';

// ---------------------------------------------------------------------------------------------------------------
// Patterns: every question pattern of a course (a template, which makes a new question for every seed) and every
// case study (which makes a new case for every seed), as the Playground lists them. Everything here is read from
// the generated outline, so a list of patterns loads no topic.
// ---------------------------------------------------------------------------------------------------------------

/** The kinds a learner filters patterns by. Quick questions are the choice questions and the calculations. */
export const PATTERN_KINDS = ['quick', 'journal', 'set', 'format', 'case'] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

export const PATTERN_KIND_LABEL: Record<PatternKind, string> = {
  quick: 'Quick questions',
  journal: 'Journal entries',
  set: 'Sets of entries',
  format: 'Formats',
  case: 'Case studies',
};

/** What a template of each kind is called on its card. */
export const TEMPLATE_KIND_LABEL: Record<Template['kind'], string> = {
  mcq: 'MCQ',
  numeric: 'Numeric',
  journal: 'Journal entry',
  journal_set: 'Set of entries',
  account: 'Account',
  statement: 'Statement',
};

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'complex'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', complex: 'Complex' };

/** How hard a pattern is, as its title says it. */
export const DIFFICULTY_WORD: Record<Difficulty, string> = { easy: 'easy', medium: 'standard', complex: 'challenging' };

/** What a question of each kind of template is, as a title says it. */
const KIND_NOUN: Record<Template['kind'], string> = {
  mcq: 'choice question',
  numeric: 'calculation',
  journal: 'journal entry',
  journal_set: 'set of entries',
  account: 'account to prepare',
  statement: 'statement to prepare',
};

export function patternKindOf(kind: Template['kind']): Exclude<PatternKind, 'case'> {
  switch (kind) {
    case 'mcq':
    case 'numeric':
      return 'quick';
    case 'journal':
      return 'journal';
    case 'journal_set':
      return 'set';
    case 'account':
    case 'statement':
      return 'format';
  }
}

/**
 * Titles written by an author, by template id. A template listed here is called by its title; every other one by the
 * title `patternTitle` derives. Empty for now: the place to put a title such as "Interest on drawings by the average
 * period" when one is written.
 */
export const PATTERN_TITLES: Readonly<Record<string, string>> = {};

/**
 * The title of a template, for a learner: its authored title (`authored`) where it has one, else its concept's title,
 * then how hard and what kind of question it makes ("Interest on drawings: standard calculation"). The templates of
 * one concept that would share a title are numbered in registry order ("... calculation 1", "... calculation 2").
 * `siblings` are the templates of its concept, itself among them.
 */
export function patternTitle(
  template: Pick<TemplateOutline, 'id' | 'kind' | 'difficulty'>,
  conceptTitle: string,
  siblings: readonly Pick<TemplateOutline, 'id' | 'kind' | 'difficulty'>[],
  authored: Readonly<Record<string, string>> = PATTERN_TITLES,
): string {
  if (Object.hasOwn(authored, template.id)) return authored[template.id];
  const alike = siblings.filter((s) => s.kind === template.kind && s.difficulty === template.difficulty);
  const at = alike.findIndex((s) => s.id === template.id);
  const number = alike.length > 1 && at >= 0 ? ` ${at + 1}` : '';
  return `${conceptTitle}: ${DIFFICULTY_WORD[template.difficulty]} ${KIND_NOUN[template.kind]}${number}`;
}

/** A pattern as the Playground lists, filters and plays it. */
export interface Pattern {
  /** The template id, or the case id. */
  id: string;
  topicId: string;
  conceptId: string;
  difficulty: Difficulty;
  kind: PatternKind;
  /** The kind of template it is; for a case study the kinds of its questions, in order. */
  parts: Template['kind'][];
  title: string;
  /** For a case study: its stage. */
  stageId?: string;
  /** Of a template that teaches beyond the syllabus of its course: why (see `TemplateBase.beyondSyllabus`). */
  beyondSyllabus?: string;
}

const byCourse = new Map<string, Pattern[]>();
const byId = new Map<string, Pattern>();

const byChoice = new Map<string, Pattern[]>();

/**
 * Every pattern of a course: its templates in course order (the order of the generator registry within each topic),
 * then its case studies stage by stage. With a learner's `choice`, only those of the topics the learner meets (Part B
 * of Class 12: content/courseOptions.ts). The same list for every call.
 */
export function coursePatterns(courseId: string, choice?: CourseChoice | null): Pattern[] {
  const all = allPatterns(courseId);
  if (choice == null) return all;
  const key = `${courseId}|${choiceKey(choice)}`;
  let mine = byChoice.get(key);
  if (!mine) {
    const kept = all.filter((p) => topicShown(p.topicId, choice));
    mine = kept.length === all.length ? all : kept;
    if (all.length > 0) byChoice.set(key, mine);
  }
  return mine;
}

function allPatterns(courseId: string): Pattern[] {
  const known = byCourse.get(courseId);
  if (known) return known;
  const templates: Pattern[] = templateOutlinesOf(courseId).map((t) => ({
    id: t.id,
    topicId: t.topicId,
    conceptId: t.conceptId,
    difficulty: t.difficulty,
    kind: patternKindOf(t.kind),
    parts: [t.kind],
    title: patternTitle(t, findConceptTitle(t.conceptId) ?? t.conceptId, templatesForConcept(t.conceptId)),
    ...(t.beyondSyllabus !== undefined ? { beyondSyllabus: t.beyondSyllabus } : {}),
  }));
  const cases: Pattern[] = stagesOf(courseId).flatMap((s) =>
    s.cases.map((c) => ({
      id: c.id,
      topicId: c.topicId,
      conceptId: c.conceptId,
      difficulty: c.difficulty,
      kind: 'case' as const,
      parts: c.parts.map((p) => p.kind),
      title: c.title,
      stageId: s.id,
    })),
  );
  const list = [...templates, ...cases];
  // An unknown course has no patterns, and is not remembered.
  if (list.length > 0) {
    byCourse.set(courseId, list);
    for (const p of list) byId.set(p.id, p);
  }
  return list;
}

/** A pattern of any course by its id; undefined for an id that is not known. */
export function findPattern(id: string): Pattern | undefined {
  if (!byId.has(id)) for (const course of COURSES) coursePatterns(course.id);
  return byId.get(id);
}

/** "1,240 question types · unlimited questions". */
export const scaleLine = (count: number): string => `${count.toLocaleString('en-IN')} ${count === 1 ? 'question type' : 'question types'} · unlimited questions`;

// ---------------------------------------------------------------------------------------------------------------
// Filters.
// ---------------------------------------------------------------------------------------------------------------

export interface PatternFilters {
  /** Words, every one of which must be found. */
  q: string;
  /** Topic ids; none is every topic. */
  topics: string[];
  kinds: PatternKind[];
  difficulties: Difficulty[];
}

export const NO_FILTERS: PatternFilters = { q: '', topics: [], kinds: [], difficulties: [] };

const words = (q: string): string[] => q.toLowerCase().split(/\s+/).filter(Boolean);

/** What a pattern is found by: its title, its topic, its kind, "beyond the syllabus" where it is and, where they are known, its sample. */
const searchText = (p: Pattern, sample: string | undefined): string =>
  [p.title, topicTitle(p.topicId), PATTERN_KIND_LABEL[p.kind], p.kind === 'case' ? 'case study' : TEMPLATE_KIND_LABEL[p.parts[0]], p.beyondSyllabus === undefined ? '' : 'beyond the syllabus', sample ?? '']
    .join('\n')
    .toLowerCase();

/** The patterns that pass the filters, in their order. `samples` (by pattern id) are searched too where they are given. */
export function filterPatterns(patterns: readonly Pattern[], filters: PatternFilters, samples?: Readonly<Record<string, string>>): Pattern[] {
  const wanted = words(filters.q);
  const topics = new Set(filters.topics);
  const kinds = new Set(filters.kinds);
  const difficulties = new Set(filters.difficulties);
  return patterns.filter((p) => {
    if (topics.size > 0 && !topics.has(p.topicId)) return false;
    if (kinds.size > 0 && !kinds.has(p.kind)) return false;
    if (difficulties.size > 0 && !difficulties.has(p.difficulty)) return false;
    if (wanted.length === 0) return true;
    const text = searchText(p, samples && Object.hasOwn(samples, p.id) ? samples[p.id] : undefined);
    return wanted.every((w) => text.includes(w));
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The address: `/playground?q=…&topics=a,b&kinds=journal,case&difficulty=easy`, and what is being played:
// `pattern=<id>` (one pattern; `topic=<topicId>` beside it is the topic of a search link), `mix=<id>,<id>` (the
// patterns chosen) or `mix=shown` (every pattern the filters show).
// ---------------------------------------------------------------------------------------------------------------

/** What the address is read from: `URLSearchParams`, or what `useSearchParams` gives. */
export interface QueryLike {
  get(name: string): string | null;
}

/** A comma list, each item once, empty items dropped. */
export const listOf = (value: string | null): string[] => [...new Set((value ?? '').split(',').map((s) => s.trim()).filter(Boolean))];

/** The items of `all` that are in a comma list, in the order of `all`. */
const pick = <T extends string>(all: readonly T[], value: string | null): T[] => {
  const asked = new Set(listOf(value));
  return all.filter((x) => asked.has(x));
};

export function filtersFromQuery(query: QueryLike): PatternFilters {
  return {
    q: (query.get('q') ?? '').trim(),
    topics: listOf([query.get('topics'), query.get('topic')].filter((x) => x !== null).join(',')),
    kinds: pick(PATTERN_KINDS, query.get('kinds')),
    difficulties: pick(DIFFICULTIES, query.get('difficulty')),
  };
}

/** A query string (no `?`) for the filters, in one order, with commas left as they are; '' when nothing is set. */
export function filtersToQuery(filters: PatternFilters): string {
  const parts: string[] = [];
  if (filters.q.trim() !== '') parts.push(`q=${encodeURIComponent(filters.q.trim())}`);
  if (filters.topics.length > 0) parts.push(`topics=${filters.topics.map(encodeURIComponent).join(',')}`);
  const kinds = PATTERN_KINDS.filter((k) => filters.kinds.includes(k));
  if (kinds.length > 0) parts.push(`kinds=${kinds.join(',')}`);
  const difficulties = DIFFICULTIES.filter((d) => filters.difficulties.includes(d));
  if (difficulties.length > 0) parts.push(`difficulty=${difficulties.join(',')}`);
  return parts.join('&');
}

/** The value of `mix` that plays every pattern the filters show. */
export const MIX_SHOWN = 'shown';

export type PlaygroundPlay = { kind: 'pattern'; id: string } | { kind: 'mix'; ids: string[] } | { kind: 'shown' };

export function playFromQuery(query: QueryLike): PlaygroundPlay | null {
  const pattern = (query.get('pattern') ?? '').trim();
  if (pattern !== '') return { kind: 'pattern', id: pattern };
  const mix = listOf(query.get('mix'));
  if (mix.length === 0) return null;
  if (mix.length === 1 && mix[0] === MIX_SHOWN) return { kind: 'shown' };
  return { kind: 'mix', ids: mix };
}

/** The address of the Playground with these filters, and with what is played when something is. */
export function playgroundHref(filters: PatternFilters, play?: PlaygroundPlay): string {
  const query = [filtersToQuery(filters), play ? playToQuery(play) : ''].filter(Boolean).join('&');
  return query ? `/playground?${query}` : '/playground';
}

/** The query string of a play, after the filters. */
export function playToQuery(play: PlaygroundPlay): string {
  if (play.kind === 'pattern') return `pattern=${encodeURIComponent(play.id)}`;
  if (play.kind === 'shown') return `mix=${MIX_SHOWN}`;
  return `mix=${play.ids.map(encodeURIComponent).join(',')}`;
}
