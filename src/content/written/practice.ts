import type { WrittenForm, WrittenQuestion } from './types';

// What the written answers screen does with a bank of questions and a learner's results: the marks of an answer from
// the points ticked, how marks are written ("2½ / 3"), which questions are still to be rewritten, the order a practice
// takes them in, and the filters of the list.

/** A learner's result on a written question, as the screens read it (the stored row has more: storage/types.ts). */
export interface WrittenOutcome {
  id: string;
  questionId: string;
  marks: number;
  maxMarks: number;
  at: number;
}

export const FORM_LABEL: Record<WrittenForm, string> = {
  distinguish: 'Distinguish',
  features: 'Features',
  explain: 'Explain',
  reasons: 'Reasons',
  list: 'List',
  'short-note': 'Short note',
};

/** The forms in the order the filters list them. */
export const WRITTEN_FORMS: readonly WrittenForm[] = ['distinguish', 'features', 'explain', 'reasons', 'list', 'short-note'];

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** How many points the board asks for, in its words: "Any three points", "Any one point". */
export function pointsAsked(q: Pick<WrittenQuestion, 'pointsNeeded'>): string {
  const n = q.pointsNeeded;
  return `Any ${NUMBER_WORDS[n] ?? String(n)} ${n === 1 ? 'point' : 'points'}`;
}

/**
 * The marks an answer earns from the number of points the learner ticked: each point is worth marks ÷ pointsNeeded,
 * and no more than `pointsNeeded` points count. Halves are kept (the bank's checks allow only marks that split into
 * halves); anything finer is rounded down.
 */
export function writtenMarks(q: Pick<WrittenQuestion, 'marks' | 'pointsNeeded'>, ticked: number): number {
  const counted = Math.max(0, Math.min(Math.floor(ticked), q.pointsNeeded));
  return Math.floor(((counted * q.marks) / q.pointsNeeded) * 2 + 1e-9) / 2;
}

/** Marks as a learner reads them: 3, 2½, ½, 0. */
export function formatMarks(marks: number): string {
  const whole = Math.floor(marks + 1e-9);
  const half = marks - whole >= 0.5 - 1e-9;
  if (!half) return String(whole);
  return whole === 0 ? '½' : `${whole}½`;
}

/** "2½ / 3". */
export const marksOutOf = (marks: number, maxMarks: number): string => `${formatMarks(marks)} / ${maxMarks}`;

/** For a screen reader, which may read "½" as nothing: "2 and a half out of 3". */
export function marksSpoken(marks: number, maxMarks: number): string {
  const whole = Math.floor(marks + 1e-9);
  const half = marks - whole >= 0.5 - 1e-9;
  const said = half ? (whole === 0 ? 'half a mark' : `${whole} and a half`) : String(whole);
  return `${said} out of ${maxMarks}`;
}

export const isFullMarks = (r: Pick<WrittenOutcome, 'marks' | 'maxMarks'>): boolean => r.marks >= r.maxMarks;

/** The latest result of each question: the one that says whether it is still to be rewritten. */
export function latestOutcomes<T extends WrittenOutcome>(results: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of results) {
    const prev = out.get(r.questionId);
    if (!prev || r.at > prev.at || (r.at === prev.at && r.id > prev.id)) out.set(r.questionId, r);
  }
  return out;
}

export type WrittenStatus = 'rewrite' | 'new' | 'full';

/** Where a question stands: written below full marks the last time (to rewrite), never written, or at full marks. */
export function writtenStatus(latest: WrittenOutcome | undefined): WrittenStatus {
  if (!latest) return 'new';
  return isFullMarks(latest) ? 'full' : 'rewrite';
}

/**
 * The order a practice takes the questions in: those to rewrite first (written longest ago first), then those never
 * written (in the order of the bank), then those at full marks (longest ago first).
 */
export function writtenQueue<Q extends Pick<WrittenQuestion, 'id'>>(questions: readonly Q[], latest: ReadonlyMap<string, WrittenOutcome>): Q[] {
  const RANK: Record<WrittenStatus, number> = { rewrite: 0, new: 1, full: 2 };
  return questions
    .map((q, i) => ({ q, i, last: latest.get(q.id) }))
    .sort((a, b) => RANK[writtenStatus(a.last)] - RANK[writtenStatus(b.last)] || (a.last?.at ?? 0) - (b.last?.at ?? 0) || a.i - b.i)
    .map((x) => x.q);
}

/** How many questions stand each way. */
export function writtenCounts(questions: readonly Pick<WrittenQuestion, 'id'>[], latest: ReadonlyMap<string, WrittenOutcome>): Record<WrittenStatus, number> {
  const out: Record<WrittenStatus, number> = { rewrite: 0, new: 0, full: 0 };
  for (const q of questions) out[writtenStatus(latest.get(q.id))]++;
  return out;
}

/** What the list is narrowed to: '' or 0 for any. */
export interface WrittenFilter {
  form: WrittenForm | '';
  marks: number;
}

export const ANY_WRITTEN: WrittenFilter = { form: '', marks: 0 };

export function filterWritten<Q extends Pick<WrittenQuestion, 'form' | 'marks'>>(questions: readonly Q[], f: WrittenFilter): Q[] {
  return questions.filter((q) => (f.form === '' || q.form === f.form) && (f.marks === 0 || q.marks === f.marks));
}

/** The filter as the address carries it: `?form=distinguish&marks=3`. Anything unknown is left out. */
export function filterFromParams(params: { get(name: string): string | null }): WrittenFilter {
  const form = params.get('form') ?? '';
  const marks = Number(params.get('marks') ?? 0);
  return {
    form: (WRITTEN_FORMS as readonly string[]).includes(form) ? (form as WrittenForm) : '',
    marks: [1, 3, 4, 6].includes(marks) ? marks : 0,
  };
}

/** The query string of a filter, with its leading '?' ('' for none); `extra` adds more (the question to start on). */
export function filterQuery(f: WrittenFilter, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (f.form) params.set('form', f.form);
  if (f.marks) params.set('marks', String(f.marks));
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const q = params.toString();
  return q ? `?${q}` : '';
}

/** The scope of a practice that takes every question to rewrite, of every topic: `/written/rewrite`. */
export const WRITTEN_REWRITE = 'rewrite';

/** The page of a practice: a topic's questions, or every question to rewrite. */
export const writtenHref = (scope: string, f: WrittenFilter = ANY_WRITTEN, extra: Record<string, string> = {}): string => `/written/${scope}${filterQuery(f, extra)}`;
