import { normalise } from '@/components/search/searchIndex';
import type { Difficulty } from '@/content/types';
import type { VivaQuestion } from './types';

// What the "Project and viva" page does with a viva bank: narrows it by topic, project option, difficulty and words
// typed, and puts the questions in the order a practice goes through them, from what the learner has marked.

/** The id of a project option's guide on the page, and of a viva question: `/practical#option-brs`, `#viva-v11-004`. */
export const optionAnchor = (id: string): string => `option-${id}`;
export const vivaAnchor = (id: string): string => `viva-${id}`;

/** What the viva bank is narrowed to: empty strings for any. */
export interface VivaFilter {
  query: string;
  topicId: string;
  optionId: string;
  difficulty: Difficulty | '';
}

export const NO_FILTER: VivaFilter = { query: '', topicId: '', optionId: '', difficulty: '' };

/** True when every word typed is in the question or its answer (at the start of a word or inside one). */
export function vivaMatches(q: Pick<VivaQuestion, 'question' | 'answer'>, query: string): boolean {
  const words = normalise(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const text = normalise(`${q.question} ${q.answer}`);
  return words.every((w) => text.includes(w));
}

/** The questions that pass a filter, in the order of the bank. */
export function filterViva(questions: readonly VivaQuestion[], f: VivaFilter): VivaQuestion[] {
  return questions.filter(
    (q) =>
      (f.topicId === '' || q.topicId === f.topicId) &&
      (f.optionId === '' || q.options.includes(f.optionId)) &&
      (f.difficulty === '' || q.difficulty === f.difficulty) &&
      vivaMatches(q, f.query),
  );
}

/** A learner's mark on a question: knew it, or not yet; and when it was marked (ms since 1970). */
export type VivaMark = { mark: 'knew' | 'notyet'; at: number };

/**
 * The order a practice takes the questions in: those marked "Not yet" first (the longest ago first), then those never
 * marked (in the order of the bank), then those marked "I knew it" (the longest ago first).
 */
export function vivaQueue(questions: readonly VivaQuestion[], marks: Readonly<Record<string, VivaMark>>): VivaQuestion[] {
  const rank = (q: VivaQuestion) => {
    const m = Object.hasOwn(marks, q.id) ? marks[q.id] : undefined;
    return m === undefined ? 1 : m.mark === 'notyet' ? 0 : 2;
  };
  const at = (q: VivaQuestion) => (Object.hasOwn(marks, q.id) ? marks[q.id].at : 0);
  return questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => rank(a.q) - rank(b.q) || at(a.q) - at(b.q) || a.i - b.i)
    .map((x) => x.q);
}

/** How many of the questions are marked each way, and how many are not marked yet. */
export function vivaCounts(questions: readonly VivaQuestion[], marks: Readonly<Record<string, VivaMark>>): { knew: number; notyet: number; unseen: number } {
  const out = { knew: 0, notyet: 0, unseen: 0 };
  for (const q of questions) {
    const m = Object.hasOwn(marks, q.id) ? marks[q.id] : undefined;
    if (!m) out.unseen++;
    else out[m.mark]++;
  }
  return out;
}

/** The marks as they are stored: anything that is not a mark is left out. */
export function marksFromStored(raw: string | null): Record<string, VivaMark> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, VivaMark> = {};
    for (const [id, value] of Object.entries(parsed)) {
      const v = value as Partial<VivaMark> | null;
      if (v && (v.mark === 'knew' || v.mark === 'notyet') && typeof v.at === 'number') out[id] = { mark: v.mark, at: v.at };
    }
    return out;
  } catch {
    return {};
  }
}
