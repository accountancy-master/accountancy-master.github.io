import { normalise } from '@/components/search/searchIndex';
import type { GlossaryEntry } from './types';

// What the glossary page does with the entries of a course: sorts them A to Z, says which letter each is under, and
// finds them by what is typed (the term, its other names and its definition) and by unit and topic.

/** The letter a term is listed under: its first letter, A to Z; '#' for a term that starts with anything else. */
export function letterOf(term: string): string {
  const first = term.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/** The entries A to Z by term (case and accents aside), '#' terms first; two equal terms by id. */
export function sortGlossary(entries: readonly GlossaryEntry[]): GlossaryEntry[] {
  return [...entries].sort((a, b) => {
    const la = letterOf(a.term);
    const lb = letterOf(b.term);
    if (la !== lb) return la === '#' ? -1 : lb === '#' ? 1 : la < lb ? -1 : 1;
    return a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

/** The letters that have at least one of these entries, in order ('#' first). */
export function lettersOf(entries: readonly GlossaryEntry[]): string[] {
  const present = new Set(entries.map((e) => letterOf(e.term)));
  return ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((l) => present.has(l));
}

/** What a search is narrowed to: words typed, a unit, a topic (empty: any). */
export interface GlossaryFilter {
  query: string;
  unit: string;
  topicId: string;
}

/**
 * How well an entry matches the typed words, or 0 when it does not: every word must be in its term, one of its other
 * names or its definition. A match in the term counts most, then one in another name, then one in the definition.
 */
export function glossaryScore(entry: GlossaryEntry, query: string): number {
  const q = normalise(query);
  if (q === '') return 1;
  const term = normalise(entry.term);
  const also = (entry.also ?? []).map(normalise);
  const definition = normalise(entry.definition);
  let total = term === q || also.includes(q) ? 100 : term.startsWith(q) ? 50 : 0;
  for (const word of q.split(' ')) {
    if (term.split(' ').some((w) => w.startsWith(word))) total += 20;
    else if (term.includes(word)) total += 15;
    else if (also.some((a) => a.includes(word))) total += 10;
    else if (definition.includes(word)) total += 2;
    else return 0;
  }
  return total;
}

/**
 * The entries that match a filter, A to Z. `unitOf` says which unit a topic is in. Every entry when nothing narrows
 * the list.
 */
export function filterGlossary(entries: readonly GlossaryEntry[], filter: GlossaryFilter, unitOf: (topicId: string) => string | undefined): GlossaryEntry[] {
  return sortGlossary(
    entries.filter(
      (e) =>
        (filter.topicId === '' || e.topicId === filter.topicId) &&
        (filter.unit === '' || unitOf(e.topicId) === filter.unit) &&
        glossaryScore(e, filter.query) > 0,
    ),
  );
}

/** The best match for what is typed, if any: the one whose term (or another name) is closest to it. */
export function bestMatch(entries: readonly GlossaryEntry[], query: string): GlossaryEntry | undefined {
  if (normalise(query) === '') return undefined;
  let best: { e: GlossaryEntry; s: number } | undefined;
  for (const e of sortGlossary(entries)) {
    const s = glossaryScore(e, query);
    if (s > 0 && (!best || s > best.s)) best = { e, s };
  }
  return best?.e;
}
