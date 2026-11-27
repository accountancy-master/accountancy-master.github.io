import { playgroundHref } from '@/components/shell/navigation';
import { templatesForConcept } from '@/content/outline';
import type { TopicMeta, TopicOutline } from '@/content/types';
import { parseGenId } from '@/generators/ids';
import { daysToExam } from './examCountdown';
import { MARK_VALUES, type MarkValue, type PaperBlueprint } from './paperBlueprints';
import { topicMastery, type Progress } from './progress';

// ---------------------------------------------------------------------------------------------------------------
// "Before the exam" (/exam): what the app knows, put together for the last stretch. The paper's pattern and a time
// for each section, the units that carry the most marks, the learner's weakest ideas, the topics not yet started,
// their most frequent mistakes, and a simple day-by-day plan to the exam date. Everything here is worked out on the
// device from the blueprints, the outline and the learner's own records.
// ---------------------------------------------------------------------------------------------------------------

/** The reading time the board gives before the writing time of a paper begins. */
export const READING_MINUTES = 15;

/**
 * Minutes shared in proportion to marks, in whole minutes that add up to `minutes` exactly: each share is rounded
 * down, and the minutes left over go to the largest remainders (the earlier section of two equal ones).
 */
export function splitMinutes(marks: readonly number[], minutes: number): number[] {
  const total = marks.reduce((s, m) => s + m, 0);
  if (total <= 0) return marks.map(() => 0);
  const exact = marks.map((m) => (m * minutes) / total);
  const out = exact.map(Math.floor);
  let left = minutes - out.reduce((s, m) => s + m, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

export interface SectionPattern {
  part?: string;
  title: string;
  marks: number;
  /** How many questions of each mark value. */
  questions: Record<MarkValue, number>;
  /** All its questions. */
  count: number;
  /** The writing time to give it: its share of the paper's time, in proportion to its marks. */
  minutes: number;
}

export interface PaperPattern {
  title: string;
  marks: number;
  /** The writing time. */
  minutes: number;
  /** Before the writing time. */
  readingMinutes: number;
  questions: number;
  /** Questions of each mark value over the whole paper. */
  byMark: Record<MarkValue, number>;
  sections: SectionPattern[];
}

/** The pattern of a paper from its blueprint, with a suggested time for each section. */
export function paperPattern(blueprint: PaperBlueprint): PaperPattern {
  const minutes = splitMinutes(blueprint.sections.map((s) => s.marks), blueprint.minutes);
  const sections = blueprint.sections.map((s, i): SectionPattern => ({
    ...(s.part ? { part: s.part } : {}),
    title: s.title,
    marks: s.marks,
    questions: { ...s.questions },
    count: MARK_VALUES.reduce((n, v) => n + s.questions[v], 0),
    minutes: minutes[i],
  }));
  const byMark = Object.fromEntries(MARK_VALUES.map((v) => [v, sections.reduce((n, s) => n + s.questions[v], 0)])) as Record<MarkValue, number>;
  return {
    title: blueprint.title,
    marks: blueprint.marks,
    minutes: blueprint.minutes,
    readingMinutes: READING_MINUTES,
    questions: sections.reduce((n, s) => n + s.count, 0),
    byMark,
    sections,
  };
}

export interface TopicWeight {
  topicId: string;
  title: string;
  /** 0 to 100. */
  mastery: number;
  started: boolean;
}

export interface UnitWeight {
  unit: string;
  marks: number;
  /** Its share of the paper, 0 to 1. */
  share: number;
  topics: TopicWeight[];
}

/**
 * The units of a course by the marks the full paper gives them, most first (of two equal, the earlier in the course),
 * each with its playable topics and the learner's mastery of them. A unit the paper does not set on its own is left
 * out.
 */
export function unitWeights(blueprint: PaperBlueprint, topics: readonly TopicMeta[], outlines: readonly TopicOutline[], progress: Progress): UnitWeight[] {
  const marks = new Map<string, number>();
  for (const s of blueprint.sections) if ('unit' in s.topics) marks.set(s.topics.unit, (marks.get(s.topics.unit) ?? 0) + s.marks);
  const order = [...new Set(topics.map((t) => t.unit))];
  return order
    .filter((unit) => marks.has(unit))
    .map((unit) => ({
      unit,
      marks: marks.get(unit)!,
      share: marks.get(unit)! / blueprint.marks,
      topics: topics.flatMap((t): TopicWeight[] => {
        const o = t.unit === unit ? outlines.find((x) => x.topicId === t.id) : undefined;
        return o ? [{ topicId: t.id, title: t.title, mastery: topicMastery(o, progress), started: o.concepts.some((c) => progress.concepts[c.id] !== undefined) }] : [];
      }),
    }))
    .filter((u) => u.topics.length > 0)
    .sort((a, b) => b.marks - a.marks || order.indexOf(a.unit) - order.indexOf(b.unit));
}

/** Where to practise a concept: the Playground on a pattern of it (`templateId` if it is one), or its topic's practice. */
export function conceptPracticeHref(topicId: string, conceptId: string, templateId?: string): string {
  const patterns = templatesForConcept(conceptId).filter((t) => t.topicId === topicId);
  if (patterns.length === 0) return `/practice/topic/${topicId}`;
  const chosen = patterns.find((t) => t.id === templateId) ?? patterns[0];
  return playgroundHref(topicId, chosen.id);
}

export interface WeakConcept {
  conceptId: string;
  title: string;
  topicId: string;
  mastery: number;
  href: string;
}

/**
 * The concepts the learner is weakest in: those attempted (a mastery is recorded), lowest mastery first, and of two
 * equally weak the earlier in the course. A concept not yet attempted is new, not weak.
 */
export function weakestConcepts(outlines: readonly TopicOutline[], progress: Progress, limit = 6): WeakConcept[] {
  const out: (WeakConcept & { i: number })[] = [];
  let i = 0;
  for (const o of outlines) {
    for (const c of o.concepts) {
      const seen = progress.concepts[c.id];
      if (seen) out.push({ conceptId: c.id, title: c.title, topicId: o.topicId, mastery: Math.round(seen.mastery), href: conceptPracticeHref(o.topicId, c.id), i });
      i++;
    }
  }
  return out
    .sort((a, b) => a.mastery - b.mastery || a.i - b.i)
    .slice(0, limit)
    .map(({ conceptId, title, topicId, mastery, href }) => ({ conceptId, title, topicId, mastery, href }));
}

export interface NewTopic {
  topicId: string;
  title: string;
  /** Its first level, where it is played from. */
  href: string;
}

/**
 * The playable topics the learner has not started (no level passed, no concept attempted), in course order, each
 * with its first level. A first level is always open, whatever the ladder.
 */
export function notStartedTopics(topics: readonly TopicMeta[], outlines: readonly TopicOutline[], progress: Progress): NewTopic[] {
  const passed = new Set(progress.passedLevelIds);
  return topics.flatMap((t): NewTopic[] => {
    const o = outlines.find((x) => x.topicId === t.id);
    if (!o || o.levels.length === 0) return [];
    const started = o.levels.some((l) => passed.has(l.id)) || o.concepts.some((c) => progress.concepts[c.id] !== undefined);
    if (started) return [];
    const first = [...o.levels].sort((a, b) => a.order - b.order)[0];
    return [{ topicId: t.id, title: t.title, href: `/play/${first.id}` }];
  });
}

/** A miss as the mistake records keep it: an attempt that was not right. */
export interface Miss {
  topicId: string;
  conceptId: string;
  questionId: string;
  correct: boolean;
  mistakeCode?: string;
  at: number;
}

export interface FrequentMistake {
  conceptId: string;
  /** The named mistake, when the misses had one. */
  mistakeCode?: string;
  /** Misses of this kind. */
  count: number;
  /** Questions of this kind whose mistake is still open. */
  open: number;
  /** Where to try a similar question: a pattern of the question missed last, or of its concept. */
  href: string;
}

export interface MistakeGroup {
  topicId: string;
  /** Misses in the topic. */
  count: number;
  mistakes: FrequentMistake[];
}

/**
 * The learner's most frequent mistakes, grouped by topic: the misses (wrong or revealed answers) counted by concept
 * and named mistake, the topic with the most misses first, and in each topic the most frequent first (of two as
 * frequent, the more recent). At most `topics` topics and `perTopic` mistakes in each. `topicIds` keeps the misses of
 * the learner's course.
 */
export function frequentMistakes(
  attempts: readonly Miss[],
  progress: Pick<Progress, 'questions'>,
  opts: { topicIds: readonly string[]; topics?: number; perTopic?: number },
): MistakeGroup[] {
  const inCourse = new Set(opts.topicIds);
  const groups = new Map<string, Map<string, { conceptId: string; mistakeCode?: string; count: number; last: Miss; questions: Set<string> }>>();
  for (const a of attempts) {
    if (a.correct || !inCourse.has(a.topicId)) continue;
    const kinds = groups.get(a.topicId) ?? new Map();
    groups.set(a.topicId, kinds);
    const key = `${a.conceptId}|${a.mistakeCode ?? ''}`;
    const kind = kinds.get(key) ?? { conceptId: a.conceptId, ...(a.mistakeCode ? { mistakeCode: a.mistakeCode } : {}), count: 0, last: a, questions: new Set<string>() };
    kinds.set(key, kind);
    kind.count++;
    kind.questions.add(a.questionId);
    if (a.at >= kind.last.at) kind.last = a;
  }
  return [...groups.entries()]
    .map(([topicId, kinds]) => {
      const list = [...kinds.values()].sort((a, b) => b.count - a.count || b.last.at - a.last.at);
      return {
        topicId,
        count: list.reduce((n, k) => n + k.count, 0),
        latest: Math.max(...list.map((k) => k.last.at)),
        mistakes: list.slice(0, opts.perTopic ?? 3).map(
          (k): FrequentMistake => ({
            conceptId: k.conceptId,
            ...(k.mistakeCode ? { mistakeCode: k.mistakeCode } : {}),
            count: k.count,
            open: [...k.questions].filter((q) => progress.questions[q]?.mistakeOpen).length,
            href: conceptPracticeHref(topicId, k.conceptId, parseGenId(k.last.questionId)?.templateId),
          }),
        ),
      };
    })
    .sort((a, b) => b.count - a.count || b.latest - a.latest)
    .slice(0, opts.topics ?? 4)
    .map(({ topicId, count, mistakes }) => ({ topicId, count, mistakes }));
}

// ---------------------------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------------------------

export type PlanKind = 'new' | 'weak' | 'mock' | 'practice' | 'mistakes' | 'cards' | 'sheets';

export interface PlanDay {
  /** YYYY-MM-DD. */
  date: string;
  kind: PlanKind;
  title: string;
  href: string;
  /** The topics of a day of topics. */
  topics?: { id: string; title: string }[];
}

/** The day `n` days after a local day (YYYY-MM-DD). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** How many of the last days before the exam are kept for quick sheets, cards and mistakes. */
export function finalDaysOf(days: number): number {
  if (days <= 2) return days;
  if (days < 7) return 1;
  if (days < 21) return 2;
  return 3;
}

/** Every how many days a mock paper comes, given the days before the final ones. */
export const mockEvery = (body: number): number => (body >= 28 ? 7 : body >= 10 ? 4 : 3);

const names = (list: readonly { title: string }[]): string =>
  list.length <= 1 ? (list[0]?.title ?? '') : `${list.slice(0, -1).map((t) => t.title).join(', ')} and ${list[list.length - 1].title}`;

/**
 * A simple day-by-day suggestion from today to the day before the exam. One thing a day:
 * - the last days (one to three, see `finalDaysOf`) are for revision: the very last for the quick sheets, the one
 *   before for the open mistakes (the rule cards when there are none), and the one before that for the rule cards;
 * - before them, a mock paper every few days (`mockEvery`: weekly with a month or more to go, every four days with
 *   ten or more, every three with less), and the last of those days is always a mock paper, a dress rehearsal;
 * - the other days take the topics not yet started, in course order, then the weakest topics, weakest first, shared
 *   out evenly (several to a day when there are more topics than days);
 * - days left after that alternate smart practice and the open mistakes (practice and the rule cards when none).
 * Nothing when the exam is today or past.
 */
export function examPlan(input: {
  today: string;
  examDay: string;
  notStarted: readonly { id: string; title: string }[];
  weak: readonly { id: string; title: string }[];
  openMistakes: number;
}): PlanDay[] {
  const days = daysToExam(input.today, input.examDay);
  if (days <= 0) return [];
  const final = finalDaysOf(days);
  const body = days - final;
  const every = mockEvery(body);
  const kinds: ('mock' | 'work')[] = Array.from({ length: body }, (_, i) => ((i + 1) % every === 0 || (body >= 3 && i === body - 1) ? 'mock' : 'work'));
  const work = kinds.filter((k) => k === 'work').length;

  // The topics, shared out over the working days: as evenly as they go, the earlier days taking one more.
  const queue = [...input.notStarted.map((t) => ({ ...t, kind: 'new' as const })), ...input.weak.filter((w) => !input.notStarted.some((n) => n.id === w.id)).map((t) => ({ ...t, kind: 'weak' as const }))];
  const topicDays: (typeof queue)[] = [];
  if (queue.length > 0 && work > 0) {
    const n = Math.min(work, queue.length);
    const base = Math.floor(queue.length / n);
    let extra = queue.length % n;
    let at = 0;
    for (let d = 0; d < n; d++) {
      const take = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      topicDays.push(queue.slice(at, at + take));
      at += take;
    }
  }

  const out: PlanDay[] = [];
  let w = 0;
  let filler = 0;
  for (let i = 0; i < body; i++) {
    const date = addDays(input.today, i);
    if (kinds[i] === 'mock') {
      out.push({ date, kind: 'mock', title: 'Sit a full mock paper against the clock', href: '/mock' });
      continue;
    }
    const topics = topicDays[w++];
    if (topics && topics.length > 0) {
      const fresh = topics.every((t) => t.kind === 'new');
      const kind: PlanKind = fresh ? 'new' : 'weak';
      const title = fresh ? `Start ${names(topics)}` : topics.some((t) => t.kind === 'new') ? `Start or strengthen ${names(topics)}` : `Strengthen ${names(topics)}`;
      const href = topics.length === 1 ? (topics[0].kind === 'new' ? `/topics/${topics[0].id}` : `/practice/topic/${topics[0].id}`) : '/topics';
      out.push({ date, kind, title, href, topics: topics.map(({ id, title: t }) => ({ id, title: t })) });
      continue;
    }
    const fill: keyof typeof FIXED = filler++ % 2 === 0 ? 'practice' : input.openMistakes > 0 ? 'mistakes' : 'cards';
    out.push({ date, ...FIXED[fill] });
  }
  // The last days, the very last for the quick sheets.
  const last: (keyof typeof FIXED)[] = (['cards', input.openMistakes > 0 ? 'mistakes' : 'cards', 'sheets'] as const).slice(3 - final);
  if (final === 3 && input.openMistakes === 0) last[0] = 'practice';
  last.forEach((kind, k) => out.push({ date: addDays(input.today, body + k), ...FIXED[kind] }));
  return out;
}

const FIXED: Record<'practice' | 'mistakes' | 'cards' | 'sheets', { kind: PlanKind; title: string; href: string }> = {
  practice: { kind: 'practice', title: 'Smart practice: your weak ideas and what is due', href: '/practice/smart' },
  mistakes: { kind: 'mistakes', title: 'Put your open mistakes right', href: '/mistakes' },
  cards: { kind: 'cards', title: 'Revise the rule cards', href: '/practice/cards' },
  sheets: { kind: 'sheets', title: 'Read the quick sheets, rules and formats', href: '/sheets' },
};
