import { getTopicPack } from '@/content/loaded';
import { COURSES, outlinesOf, stagesOf, templateOutlinesOf, topicTitle } from '@/content/outline';
import type { Course, Difficulty, Question, QuestionOutline } from '@/content/types';
import { createRng } from '@/engine/rng';
import { outsidePapers } from '@/generators/outsidePapers';
import { generateCaseQuestions, generateQuestion } from '@/generators/loaded';
import type { CaseOutline, Template, TemplateOutline } from '@/generators/types';
import { PART_B_COURSE, choiceForTopics } from '@/content/courseOptions';
import { bankOfPaper, buildPaper, paperAvailable, paperTitle, paperTopics, type PaperRef } from './mockPaper';

// ---------------------------------------------------------------------------------------------------------------
// Printable worksheets. A worksheet is a pure function of its choices (the course, the topics, the kinds of question,
// the difficulty, how many) and a seed, or of a kind of paper and its number: the same choices and seed always make
// the same questions in the same order. Both are written into a short code, `W11-7K3QA-M2X9B`, which a teacher can
// hand out, type in again later, or put in an address (`/worksheets/sheet?code=...`), and which the sheet prints on
// every page. The questions come from the generators and the authored questions, exactly as the app plays them; how
// they are laid out for paper is in worksheetLayout.ts.
// ---------------------------------------------------------------------------------------------------------------

/** The kinds of question a worksheet can ask, in the order a sheet sets them. */
export const SHEET_KINDS = ['quick', 'journal', 'set', 'format', 'case'] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

export const SHEET_KIND_LABEL: Record<SheetKind, string> = {
  quick: 'Quick questions',
  journal: 'Journal entries',
  set: 'Sets of entries',
  format: 'Accounts and statements',
  case: 'Case studies',
};

/** What each kind holds, in a line under its name. */
export const SHEET_KIND_NOTE: Record<SheetKind, string> = {
  quick: 'Choice, true or false, and short sums',
  journal: 'One entry to journalise',
  set: '"Journalise the following transactions"',
  format: 'Ledger accounts, books and statements to prepare',
  case: 'One business, several linked questions',
};

export const SHEET_DIFFICULTIES = ['mixed', 'easy', 'medium', 'complex'] as const;
export type SheetDifficulty = (typeof SHEET_DIFFICULTIES)[number];

export const SHEET_COUNTS = [10, 20, 30, 50] as const;
export type SheetCount = (typeof SHEET_COUNTS)[number];

/** The papers a worksheet can be set as: the course's full paper and its half-yearly paper. */
export const SHEET_PAPERS = ['full', 'half'] as const;
export type SheetPaper = (typeof SHEET_PAPERS)[number];

/** The seed of a sheet of topics is 1 to this; the number of a paper is 1 to `MAX_PAPER_SEED`. */
export const MAX_SHEET_SEED = 32767;
export const MAX_PAPER_SEED = 9999;

export type SheetSpec =
  | {
      courseId: string;
      mode: 'topics';
      /** In course order, each once. */
      topicIds: string[];
      /** In the order of `SHEET_KINDS`, each once. */
      kinds: SheetKind[];
      difficulty: SheetDifficulty;
      count: SheetCount;
      seed: number;
    }
  | {
      courseId: string;
      mode: 'paper';
      paper: SheetPaper;
      /** The number of the paper: the same as that of the mock paper of the same kind. */
      seed: number;
      /**
       * 'computerised' for the paper of a learner who takes Computerised Accounting as Part B of Class 12 (its code
       * says so in the place of the difficulty, which a paper has none of); left out for the default.
       */
      partB?: 'computerised';
    };

// ---------------------------------------------------------------------------------------------------------------
// The code. `W` and the class (11 or 12), then ten characters of Crockford's base 32 in two groups of five: six for
// the choices, three for the seed and one to check the others, so that a letter copied wrong or two letters swapped
// are refused instead of making another sheet. The choices are one number: the topics as a mask over the course
// catalogue (a paper has none), then the kinds as a mask (a paper: 1 for the full paper, 2 for the half-yearly),
// the difficulty and how many.
// ---------------------------------------------------------------------------------------------------------------

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SETTINGS_CHARS = 6;
const SEED_CHARS = 3;
/** A course can have this many topics in its catalogue and still be written in a code. */
export const MAX_CODE_TOPICS = 21;

/** The class a course is written as in a code. */
const COURSE_CODES: Record<string, string> = { 'cbse-11-accountancy': '11', 'cbse-12-accountancy': '12' };

const courseById = (courseId: string): Course | undefined => COURSES.find((c) => c.id === courseId);
const courseOfCode = (digits: string): string | undefined => Object.keys(COURSE_CODES).find((id) => COURSE_CODES[id] === digits);

/** True for a course that worksheets can be made for. */
export const hasWorksheets = (courseId: string): boolean => Object.hasOwn(COURSE_CODES, courseId) && courseById(courseId) !== undefined;

function toBase32(value: number, chars: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < chars; i++) {
    out.unshift(value % 32);
    value = Math.floor(value / 32);
  }
  return out;
}

const fromBase32 = (digits: readonly number[]): number => digits.reduce((n, d) => n * 32 + d, 0);

/** The check of the code's other characters: a weighted sum, so a wrong character or two swapped ones change it. */
function checkOf(course: string, body: readonly number[]): number {
  const sum = body.reduce((s, v, i) => s + (i + 1) * v, Number(course) * 11);
  return sum % 31;
}

/** The playable topics of a course, by their place in its catalogue. */
function playableIndexes(course: Course): Map<string, number> {
  const playable = new Set(outlinesOf(course.id).map((o) => o.topicId));
  return new Map(course.topics.flatMap((t, i) => (playable.has(t.id) ? [[t.id, i] as const] : [])));
}

const DIFFICULTY_INDEX: Record<SheetDifficulty, number> = { mixed: 0, easy: 1, medium: 2, complex: 3 };
/** What a paper's code holds in the place of the difficulty for a paper set for Computerised Accounting as Part B. */
const PAPER_CAS = 1;

/** The mock paper a sheet of a paper is: the same kind, number and choice of Part B. */
const sheetPaperRef = (spec: Extract<SheetSpec, { mode: 'paper' }>): PaperRef => ({ kind: spec.paper, number: spec.seed, ...(spec.partB ? { partB: spec.partB } : {}) });

/** The code of a worksheet: `W11-7K3QA-M2X9B`. Throws for choices no code can hold. */
export function worksheetCode(spec: SheetSpec): string {
  const course = courseById(spec.courseId);
  const digits = COURSE_CODES[spec.courseId];
  if (!course || !digits) throw new Error(`No worksheets for the course ${spec.courseId}`);
  let mask = 0;
  let kinds = 0;
  let difficulty = 0;
  let count = 0;
  if (spec.mode === 'topics') {
    const at = playableIndexes(course);
    for (const id of spec.topicIds) {
      const i = at.get(id);
      if (i === undefined || i >= MAX_CODE_TOPICS) throw new Error(`A worksheet cannot be set on ${id}`);
      mask += 2 ** i;
    }
    if (mask === 0) throw new Error('A worksheet needs a topic');
    for (const kind of spec.kinds) kinds |= 1 << SHEET_KINDS.indexOf(kind);
    if (kinds === 0) throw new Error('A worksheet needs a kind of question');
    difficulty = DIFFICULTY_INDEX[spec.difficulty];
    count = SHEET_COUNTS.indexOf(spec.count);
    if (count < 0) throw new Error(`A worksheet cannot have ${spec.count} questions`);
    if (!Number.isInteger(spec.seed) || spec.seed < 1 || spec.seed > MAX_SHEET_SEED) throw new Error(`Invalid seed of a worksheet: ${spec.seed}`);
  } else {
    kinds = SHEET_PAPERS.indexOf(spec.paper) + 1;
    if (kinds === 0) throw new Error(`Unknown paper: ${spec.paper}`);
    // A paper has no difficulty: the place holds the choice of Part B it is set for (0, the default, as it always was).
    if (spec.partB === 'computerised') {
      if (spec.courseId !== PART_B_COURSE) throw new Error(`No choice of Part B in the course ${spec.courseId}`);
      difficulty = PAPER_CAS;
    }
    if (!Number.isInteger(spec.seed) || spec.seed < 1 || spec.seed > MAX_PAPER_SEED) throw new Error(`Invalid paper number: ${spec.seed}`);
  }
  const settings = ((mask * 32 + kinds) * 4 + difficulty) * 4 + count;
  const body = [...toBase32(settings, SETTINGS_CHARS), ...toBase32(spec.seed, SEED_CHARS)];
  const chars = [...body, checkOf(digits, body)].map((v) => ALPHABET[v]).join('');
  return `W${digits}-${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export type ParsedCode = { ok: true; spec: SheetSpec; code: string } | { ok: false; reason: string };

export const CODE_EXAMPLE = 'W11-7K3QA-M2X9B';
const NOT_A_CODE = `That is not a worksheet code. A code looks like ${CODE_EXAMPLE}.`;
const MISTYPED = 'That code has a mistake in it: a letter may be copied wrong, or two swapped. Check it against the sheet.';
const UNKNOWN = 'That code is for a sheet this version of the app cannot make.';

/**
 * The worksheet a code names, or why it names none. Spaces, dashes and small letters do not matter, and the letters
 * that look like digits are read as them (O as 0, I and L as 1), as Crockford's base 32 does.
 */
export function parseWorksheetCode(input: string): ParsedCode {
  const upper = input.trim().toUpperCase().replace(/[\s-]/g, '');
  const text = upper.slice(0, 1) + upper.slice(1).replace(/O/g, '0').replace(/[IL]/g, '1');
  const m = /^W(\d\d)([0-9A-Z]{10})$/.exec(text);
  if (!m) return { ok: false, reason: NOT_A_CODE };
  const courseId = courseOfCode(m[1]);
  const values = [...m[2]].map((ch) => ALPHABET.indexOf(ch));
  if (values.some((v) => v < 0)) return { ok: false, reason: NOT_A_CODE };
  const body = values.slice(0, 9);
  if (checkOf(m[1], body) !== values[9]) return { ok: false, reason: MISTYPED };
  const course = courseId ? courseById(courseId) : undefined;
  if (!courseId || !course) return { ok: false, reason: UNKNOWN };
  let settings = fromBase32(body.slice(0, SETTINGS_CHARS));
  const seed = fromBase32(body.slice(SETTINGS_CHARS));
  const count = settings % 4;
  settings = Math.floor(settings / 4);
  const difficulty = settings % 4;
  settings = Math.floor(settings / 4);
  const kinds = settings % 32;
  const mask = Math.floor(settings / 32);
  let spec: SheetSpec;
  if (mask === 0) {
    const paper = SHEET_PAPERS[kinds - 1];
    const cas = difficulty === PAPER_CAS && courseId === PART_B_COURSE;
    if (!paper || (difficulty !== 0 && !cas) || count !== 0 || seed < 1 || seed > MAX_PAPER_SEED) return { ok: false, reason: UNKNOWN };
    spec = { courseId, mode: 'paper', paper, seed, ...(cas ? { partB: 'computerised' as const } : {}) };
  } else {
    if (kinds === 0 || seed < 1 || seed > MAX_SHEET_SEED) return { ok: false, reason: UNKNOWN };
    const at = playableIndexes(course);
    const topicIds = course.topics.filter((t, i) => Math.floor(mask / 2 ** i) % 2 === 1).map((t) => t.id);
    // Every topic the mask names must be one the course can play, and the mask must name nothing past the catalogue.
    const known = topicIds.reduce((n, id) => n + (at.has(id) ? 2 ** at.get(id)! : 0), 0);
    if (known !== mask) return { ok: false, reason: UNKNOWN };
    spec = {
      courseId,
      mode: 'topics',
      topicIds,
      kinds: SHEET_KINDS.filter((_, i) => (kinds & (1 << i)) !== 0),
      difficulty: SHEET_DIFFICULTIES[difficulty],
      count: SHEET_COUNTS[count],
      seed,
    };
  }
  if (spec.mode === 'paper' && !paperAvailable(spec.paper, bankOfPaper(courseId, spec))) return { ok: false, reason: UNKNOWN };
  return { ok: true, spec, code: worksheetCode(spec) };
}

/** A seed drawn at random, for a new sheet: from `random`, a number in [0, 1). */
export function drawSeed(spec: Pick<SheetSpec, 'mode'>, random: () => number = Math.random): number {
  const most = spec.mode === 'paper' ? MAX_PAPER_SEED : MAX_SHEET_SEED;
  return 1 + Math.floor(random() * most);
}

/** The address of the sheet a code names. */
export const sheetHref = (code: string): string => `/worksheets/sheet?code=${encodeURIComponent(code)}`;

/** The same choices with another seed: what "New sheet" makes. */
export const withSeed = (spec: SheetSpec, seed: number): SheetSpec => ({ ...spec, seed });

// ---------------------------------------------------------------------------------------------------------------
// Where the questions come from. Everything a sheet of topics draws on is known from the outline, so the builder can
// say what each kind has before any topic is loaded; making the questions needs the topics (`sheetTopics`).
// ---------------------------------------------------------------------------------------------------------------

/** The kind of sheet question a template makes. */
export const kindOfTemplate = (kind: Template['kind']): SheetKind =>
  kind === 'journal' ? 'journal' : kind === 'journal_set' ? 'set' : kind === 'account' || kind === 'statement' ? 'format' : 'quick';

/** The kind of sheet question an authored question is. */
export const kindOfQuestion = (type: Question['type']): SheetKind =>
  type === 'journal_entry' ? 'journal' : type === 'journal_set' ? 'set' : type === 'account' || type === 'statement' ? 'format' : 'quick';

/** Something a question of a sheet is made from. */
export type SheetSource =
  | { kind: SheetKind; topicId: string; difficulty: Difficulty; template: TemplateOutline }
  | { kind: SheetKind; topicId: string; difficulty: Difficulty; authored: QuestionOutline }
  | { kind: 'case'; topicId: string; difficulty: Difficulty; case: CaseOutline };

const sourceId = (s: SheetSource): string => ('template' in s ? s.template.id : 'authored' in s ? s.authored.id : s.case.id);

/**
 * Everything the topics have that a sheet can ask, of one difficulty or of any (`mixed`): templates, authored
 * questions (not those of an authored case, which stand only with their case) and the case studies of the stages the
 * topics close.
 */
export function sheetSources(courseId: string, topicIds: readonly string[], difficulty: SheetDifficulty): SheetSource[] {
  const topics = new Set(topicIds);
  const fits = (d: Difficulty) => difficulty === 'mixed' || d === difficulty;
  const out: SheetSource[] = [];
  for (const outline of outlinesOf(courseId)) {
    if (!topics.has(outline.topicId)) continue;
    for (const template of templateOutlinesOf(courseId)) {
      if (template.topicId === outline.topicId && fits(template.difficulty) && !outsidePapers(template.id)) out.push({ kind: kindOfTemplate(template.kind), topicId: template.topicId, difficulty: template.difficulty, template });
    }
    for (const q of outline.questions) {
      if (q.context === undefined && fits(q.difficulty) && !outsidePapers(q.id)) out.push({ kind: kindOfQuestion(q.type), topicId: q.topicId, difficulty: q.difficulty, authored: q });
    }
    for (const stage of stagesOf(courseId)) {
      if (stage.topicId !== outline.topicId) continue;
      for (const c of stage.cases) if (fits(c.difficulty)) out.push({ kind: 'case', topicId: stage.topicId, difficulty: c.difficulty, case: c });
    }
  }
  return out;
}

/** How many sources of each kind the topics have, at a difficulty: what the builder offers. */
export function kindCounts(courseId: string, topicIds: readonly string[], difficulty: SheetDifficulty): Record<SheetKind, number> {
  const counts = Object.fromEntries(SHEET_KINDS.map((k) => [k, 0])) as Record<SheetKind, number>;
  for (const s of sheetSources(courseId, topicIds, difficulty)) counts[s.kind]++;
  return counts;
}

/** The topics to load before a sheet can be made. */
export function sheetTopics(spec: SheetSpec): string[] {
  return spec.mode === 'topics' ? [...spec.topicIds] : paperTopics(sheetPaperRef(spec), bankOfPaper(spec.courseId, spec));
}

// ---------------------------------------------------------------------------------------------------------------
// Marks, as the mock papers count them (MARK_SOURCES in paperBlueprints.ts): a choice or true-or-false question 1, a
// worked question or entry 3 (4 when complex), a set of entries 3, 4 or 6 by its length, a format 4 (6 when complex),
// a case study 6.
// ---------------------------------------------------------------------------------------------------------------

export function marksOf(kind: SheetKind, difficulty: Difficulty, type?: Question['type']): number {
  switch (kind) {
    case 'quick':
      return type === 'mcq' || type === 'true_false' ? 1 : difficulty === 'complex' ? 4 : 3;
    case 'journal':
      return difficulty === 'complex' ? 4 : 3;
    case 'set':
      return difficulty === 'easy' ? 3 : difficulty === 'medium' ? 4 : 6;
    case 'format':
      return difficulty === 'complex' ? 6 : 4;
    case 'case':
      return 6;
  }
}

/** The kind of sheet question a question of a paper is: a case when it has its case, otherwise by its type. */
const kindOfEntry = (questions: readonly Question[], isCase: boolean): SheetKind => (isCase ? 'case' : kindOfQuestion(questions[0].type));

// ---------------------------------------------------------------------------------------------------------------
// The sheet.
// ---------------------------------------------------------------------------------------------------------------

/** One numbered question of a sheet. A case study is one question whose parts are (a), (b), ... */
export interface SheetItem {
  /** Counted from 1. */
  number: number;
  marks: number;
  kind: SheetKind;
  topicId: string;
  /** The part of a paper it is printed in, for a paper that has parts. */
  part?: string;
  caseTitle?: string;
  /** One question; for a case study every question of the case, in order. */
  questions: Question[];
}

export interface Worksheet {
  code: string;
  spec: SheetSpec;
  /** "Ledger and Trial Balance", "Full paper 37". */
  title: string;
  /** What was asked for, in a line: "Journal entries and sets of entries · medium · 10 questions". */
  subtitle: string;
  marks: number;
  /** The time of a paper. */
  minutes?: number;
  items: SheetItem[];
}

/** Seeds of worksheets: the 4,000,000,000s, a block of 64 for every seed of a sheet (see mockPaper.ts for the others). */
export const WORKSHEET_SEED_BASE = 4_000_000_000;
const SLOTS_PER_SHEET = 64;
const DEAL_SALT = 0x5bd1e995;

/** The seed of the question in slot `slot` of a sheet. */
export const sheetQuestionSeed = (seed: number, slot: number): number => WORKSHEET_SEED_BASE + seed * SLOTS_PER_SHEET + slot;

/** The title of a sheet of topics: "All topics", the units it covers whole, or the topics themselves. */
export function topicsTitle(courseId: string, topicIds: readonly string[]): string {
  const course = courseById(courseId);
  // The topics of the choice of Part B the sheet's topics belong to (all of the course when they mix the two).
  const playable = outlinesOf(courseId, choiceForTopics(topicIds) ?? undefined).map((o) => o.topicId);
  if (!course) return topicIds.map(topicTitle).join(', ');
  if (playable.length > 0 && playable.every((id) => topicIds.includes(id))) return 'All topics';
  const chosen = new Set(topicIds);
  const units = [...new Set(course.topics.filter((t) => chosen.has(t.id)).map((t) => t.unit))];
  const whole = units.every((unit) => course.topics.filter((t) => t.unit === unit && playable.includes(t.id)).every((t) => chosen.has(t.id)));
  const names = whole && units.length < topicIds.length ? units : topicIds.map(topicTitle);
  if (names.length <= 3) return joinWords(names);
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

const joinWords = (words: readonly string[]): string => (words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

function subtitleOf(spec: Extract<SheetSpec, { mode: 'topics' }>, asked: number): string {
  const kinds = joinWords(spec.kinds.map((k, i) => (i === 0 ? SHEET_KIND_LABEL[k] : SHEET_KIND_LABEL[k].toLowerCase())));
  const difficulty = spec.difficulty === 'mixed' ? 'mixed difficulty' : spec.difficulty;
  return `${kinds} · ${difficulty} · ${asked} ${asked === 1 ? 'question' : 'questions'}`;
}

/**
 * The worksheet of a spec: every topic it draws on must have been loaded (`sheetTopics`).
 *
 * A sheet of topics deals its questions one by one: the kinds take turns (from a kind drawn for the sheet), and each
 * question goes to the topic that has had the fewest of that kind, which then gives something it has not given yet,
 * at random; once a topic has given everything it has of a kind, its templates and cases are used again with other
 * seeds (an authored question is never asked twice). The sheet sets them kind by kind (quick questions first, case
 * studies last), lighter before heavier, in course order. A paper is the mock paper of the same kind and number.
 */
export function buildWorksheet(given: SheetSpec): Worksheet {
  // The choices as the code holds them (topics and kinds in their order), so that a sheet never turns on how they were listed.
  const parsed = parseWorksheetCode(worksheetCode(given));
  if (!parsed.ok) throw new Error(parsed.reason);
  const { spec, code } = parsed;
  if (spec.mode === 'paper') {
    const bank = bankOfPaper(spec.courseId, spec);
    const ref = sheetPaperRef(spec);
    const paper = buildPaper(ref, bank);
    const hours = paper.minutes / 60;
    return {
      code,
      spec,
      title: paperTitle(ref, bank),
      subtitle: `${paper.marks} marks · ${Number.isInteger(hours) ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : `${paper.minutes} minutes`} · in the board's pattern`,
      marks: paper.marks,
      minutes: paper.minutes,
      items: paper.entries.map((e) => ({
        number: e.number,
        marks: e.marks,
        kind: kindOfEntry(e.questions, e.caseId !== undefined),
        topicId: e.topicId,
        ...(e.part === undefined ? {} : { part: e.part }),
        ...(e.caseTitle === undefined ? {} : { caseTitle: e.caseTitle }),
        questions: e.questions,
      })),
    };
  }

  const course = courseById(spec.courseId);
  const order = new Map((course?.topics ?? []).map((t, i) => [t.id, i]));
  const sources = sheetSources(spec.courseId, spec.topicIds, spec.difficulty);
  const rng = createRng((sheetQuestionSeed(spec.seed, 0) ^ DEAL_SALT ^ settingsHash(code)) >>> 0);
  const kinds = spec.kinds.filter((k) => sources.some((s) => s.kind === k));
  const start = kinds.length > 0 ? rng.int(0, kinds.length - 1) : 0;
  const turns = [...kinds.slice(start), ...kinds.slice(0, start)];
  const used = new Set<string>();
  const broken = new Set<string>();
  const had = new Map<string, number>();
  const dealt: (Omit<SheetItem, 'number'> & { order: number })[] = [];

  /** The next question of a kind from the topic that has had the fewest, or null when no topic has one to give. */
  const deal = (kind: SheetKind, slot: number): Omit<SheetItem, 'number'> | null => {
    for (;;) {
      const ofKind = sources.filter((s) => s.kind === kind && !broken.has(sourceId(s)));
      const open = spec.topicIds.flatMap((topicId) => {
        const mine = ofKind.filter((s) => s.topicId === topicId);
        const fresh = mine.filter((s) => !used.has(sourceId(s)));
        // Once everything is used, the templates and cases may be used again: with a new seed they ask anew.
        const pool = fresh.length > 0 ? fresh : mine.filter((s) => !('authored' in s));
        return pool.length > 0 ? [{ topicId, pool }] : [];
      });
      if (open.length === 0) return null;
      const key = (topicId: string) => `${kind}|${topicId}`;
      const fewest = Math.min(...open.map((o) => had.get(key(o.topicId)) ?? 0));
      const { topicId, pool } = rng.pick(open.filter((o) => (had.get(key(o.topicId)) ?? 0) === fewest));
      const source = rng.pick(pool);
      const id = sourceId(source);
      const seed = sheetQuestionSeed(spec.seed, slot);
      let questions: Question[];
      try {
        if ('template' in source) questions = [generateQuestion(source.template.id, seed)];
        else if ('case' in source) questions = generateCaseQuestions(source.case.id, seed);
        else {
          const q = getTopicPack(source.topicId)?.questions.find((x) => x.id === source.authored.id);
          if (!q) throw new Error(`Question ${source.authored.id} is not loaded`);
          questions = [q];
        }
      } catch (error) {
        // A topic that is not loaded is the caller's mistake; a seed a template cannot use only rules the source out.
        if (error instanceof Error && /not loaded/.test(error.message)) throw error;
        broken.add(id);
        continue;
      }
      used.add(id);
      had.set(key(topicId), (had.get(key(topicId)) ?? 0) + 1);
      const caseTitle = 'case' in source ? { caseTitle: source.case.title } : {};
      return { marks: marksOf(kind, source.difficulty, questions[0].type), kind, topicId, ...caseTitle, questions };
    }
  };

  for (let slot = 0; slot < spec.count && turns.length > 0; slot++) {
    for (let k = 0; k < turns.length; k++) {
      const kind = turns[(slot + k) % turns.length];
      const item = deal(kind, slot);
      if (item) {
        dealt.push({ ...item, order: slot });
        break;
      }
    }
  }

  const items = dealt
    .sort((a, b) => SHEET_KINDS.indexOf(a.kind) - SHEET_KINDS.indexOf(b.kind) || a.marks - b.marks || (order.get(a.topicId) ?? 0) - (order.get(b.topicId) ?? 0) || a.order - b.order)
    .map((item, i): SheetItem => {
      const { marks, kind, topicId, caseTitle, questions } = item;
      return { number: i + 1, marks, kind, topicId, ...(caseTitle === undefined ? {} : { caseTitle }), questions };
    });
  return {
    code,
    spec,
    title: topicsTitle(spec.courseId, spec.topicIds),
    subtitle: subtitleOf(spec, items.length),
    marks: items.reduce((sum, item) => sum + item.marks, 0),
    items,
  };
}

/** A number from the code, so that two sheets of other choices and the same seed deal differently. */
function settingsHash(code: string): number {
  let h = 0x811c9dc5;
  for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

/** Every question of a sheet, in order: a case's parts one after another. */
export const sheetQuestions = (sheet: Worksheet): Question[] => sheet.items.flatMap((item) => item.questions);

/** "12" for a question, "12(b)" for a part of a case. */
export const partLabel = (item: Pick<SheetItem, 'number' | 'kind'>, part: number): string =>
  item.kind === 'case' ? `${item.number}(${String.fromCharCode(97 + part)})` : String(item.number);
