import type { Course, Difficulty, TopicOutline } from '@/content/types';
import type { TemplateOutline } from '@/generators/types';
import { playgroundHref } from '@/components/shell/navigation';

// ---------------------------------------------------------------------------------------------------------------
// The index of "Go to" (Ctrl K): every page, every topic of both courses (by its title, its unit and the titles of its
// concepts), the mind map of every topic, every lab of the simulator, every level, every rule card, every question pattern (by its concept and its
// topic) and every case study.
// It is built from the generated outline and catalogue, and the card titles, so no topic's content is loaded to search.
// ---------------------------------------------------------------------------------------------------------------

export type SearchKind = 'page' | 'topic' | 'map' | 'lab' | 'level' | 'card' | 'pattern' | 'case' | 'term' | 'project' | 'viva';

export interface SearchEntry {
  kind: SearchKind;
  title: string;
  /** One line under the title: where it is, what it is. */
  detail: string;
  href: string;
  /** The course it belongs to; null for a page, which belongs to every course. */
  courseId: string | null;
  /** Leave the link unfetched ahead (a page a build may not have yet). */
  prefetch?: false;
  /** The title, normalised. */
  key: string;
  /** Everything else it is found by, normalised. */
  terms: string;
}

export interface SearchSources {
  courses: readonly Pick<Course, 'id' | 'title' | 'topics'>[];
  outlines: readonly TopicOutline[];
  templates: readonly TemplateOutline[];
  stages: readonly { id: string; topicId: string; title: string; cases: readonly { id: string; title: string; difficulty: Difficulty }[] }[];
  cardTitles: Readonly<Record<string, string>>;
  pages: readonly { href: string; label: string; description: string; keywords?: string; prefetch?: false }[];
  /** The labs of the simulator that are offered (src/simulator/labs.ts). */
  labs?: readonly { id: string; title: string; blurb: string; keywords: string; topicIds: readonly string[] }[];
}

/** Lower case, no apostrophes, every other mark a space, spaces squeezed: what is compared. */
export const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\u0080-￿]+/g, ' ')
    .trim();

/** What a pattern asks for, by the kind of its template. */
export const PATTERN_KIND_LABEL: Record<TemplateOutline['kind'], string> = {
  journal: 'Journal entry',
  journal_set: 'Set of entries',
  account: 'Account',
  statement: 'Statement',
  mcq: 'Multiple choice',
  numeric: 'Work out the figure',
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'easy', medium: 'medium', complex: 'hard' };

export function buildSearchIndex(src: SearchSources): SearchEntry[] {
  const out: SearchEntry[] = [];
  const add = (e: Omit<SearchEntry, 'key' | 'terms'>, terms: string) => out.push({ ...e, key: normalise(e.title), terms: normalise(terms) });
  const courseOf = new Map<string, string>();
  const topicTitle = new Map<string, string>();
  const unitOf = new Map<string, string>();
  for (const c of src.courses) {
    for (const t of c.topics) {
      courseOf.set(t.id, c.id);
      topicTitle.set(t.id, t.title);
      unitOf.set(t.id, t.unit);
    }
  }
  const conceptTitle = new Map(src.outlines.flatMap((o) => o.concepts.map((c) => [c.id, c.title] as const)));

  for (const p of src.pages) {
    add({ kind: 'page', title: p.label, detail: p.description, href: p.href, courseId: null, ...(p.prefetch === false ? { prefetch: false } : {}) }, `${p.description} ${p.keywords ?? ''}`);
  }

  // A lab belongs to every course, like a page, but is found by its title and its topics, not listed with nothing typed.
  for (const l of src.labs ?? []) {
    const topics = l.topicIds.map((t) => topicTitle.get(t) ?? '').join(' ');
    add({ kind: 'lab', title: l.title, detail: `Simulator lab · ${topicTitle.get(l.topicIds[0]) ?? ''}`, href: l.id === 'equation' ? '/simulator' : `/simulator?lab=${l.id}`, courseId: null }, `simulator lab animation ${l.blurb} ${l.keywords} ${topics}`);
  }

  // Topics in the order of the courses; then what is in them, topic by topic.
  const ordered = src.courses.flatMap((c) => c.topics.flatMap((t) => src.outlines.filter((o) => o.topicId === t.id)));
  for (const o of ordered) {
    const courseId = courseOf.get(o.topicId)!;
    const title = topicTitle.get(o.topicId) ?? o.topicId;
    add({ kind: 'topic', title, detail: unitOf.get(o.topicId) ?? '', href: `/topics/${o.topicId}`, courseId }, `${unitOf.get(o.topicId) ?? ''} ${o.concepts.map((c) => c.title).join(' ')}`);
  }
  for (const o of ordered) {
    const courseId = courseOf.get(o.topicId)!;
    const title = topicTitle.get(o.topicId) ?? o.topicId;
    add({ kind: 'map', title: `Mind map: ${title}`, detail: `Mind map · ${unitOf.get(o.topicId) ?? ''}`, href: `/maps/${o.topicId}`, courseId }, `mind map concept map ${unitOf.get(o.topicId) ?? ''}`);
  }
  for (const o of ordered) {
    const courseId = courseOf.get(o.topicId)!;
    const title = topicTitle.get(o.topicId) ?? o.topicId;
    for (const l of [...o.levels].sort((a, b) => a.order - b.order)) {
      add({ kind: 'level', title: l.title, detail: `Level ${l.order} · ${title}`, href: `/play/${l.id}`, courseId }, `level ${l.order} ${title}`);
    }
    for (const c of o.cards) {
      const front = src.cardTitles[c.id];
      if (!front) continue;
      add({ kind: 'card', title: front, detail: `Rule card · ${conceptTitle.get(c.conceptId) ?? title}`, href: `/topics/${o.topicId}#card-${c.id}`, courseId }, `card rule ${conceptTitle.get(c.conceptId) ?? ''} ${title}`);
    }
  }
  // The question types of a concept are one entry, not a row each of the same title: it opens the first of them in
  // the playground of its topic, where the others are beside it.
  const byConcept = new Map<string, TemplateOutline[]>();
  for (const t of src.templates) {
    if (!courseOf.has(t.topicId)) continue;
    const key = `${t.topicId}
${t.conceptId}`;
    byConcept.set(key, [...(byConcept.get(key) ?? []), t]);
  }
  for (const group of byConcept.values()) {
    const t = group[0];
    const courseId = courseOf.get(t.topicId)!;
    const concept = conceptTitle.get(t.conceptId) ?? t.conceptId;
    const topic = topicTitle.get(t.topicId) ?? t.topicId;
    const kinds = [...new Set(group.map((x) => PATTERN_KIND_LABEL[x.kind]))];
    const levels = [...new Set(group.map((x) => DIFFICULTY_LABEL[x.difficulty]))];
    const detail = group.length === 1 ? `${kinds[0]}, ${levels[0]} · ${topic}` : `${group.length} question types: ${kinds.join(', ').toLowerCase()} · ${topic}`;
    add(
      { kind: 'pattern', title: concept, detail, href: playgroundHref(t.topicId, t.id), courseId, prefetch: false },
      `pattern question type practice ${kinds.join(' ')} ${levels.join(' ')} ${topic}`,
    );
  }
  for (const s of src.stages) {
    const courseId = courseOf.get(s.topicId);
    if (!courseId) continue;
    for (const c of s.cases) {
      add({ kind: 'case', title: c.title, detail: `Case study · ${s.title}`, href: `/cases/play/${s.id}?case=${encodeURIComponent(c.id)}`, courseId }, `case study ${s.title} ${topicTitle.get(s.topicId) ?? ''}`);
    }
  }
  return out;
}

/**
 * The terms of the glossaries, for "Go to": "Goodwill (glossary)", found by the term, its other names and its topic,
 * and opened at its place on the glossary page (`/glossary#goodwill`). They are fetched when "Go to" first opens, so
 * they are added to the index then.
 */
export function glossarySearchEntries(
  glossaries: readonly { courseId: string; entries: readonly { id: string; term: string; also?: string[]; topicId: string }[] }[],
  courses: SearchSources['courses'],
): SearchEntry[] {
  const topicTitle = new Map(courses.flatMap((c) => c.topics.map((t) => [t.id, t.title] as const)));
  return glossaries.flatMap(({ courseId, entries }) =>
    entries.map((e): SearchEntry => {
      const topic = topicTitle.get(e.topicId) ?? '';
      const title = `${e.term} (glossary)`;
      return { kind: 'term', title, detail: `Glossary · ${topic}`, href: `/glossary#${e.id}`, courseId, key: normalise(title), terms: normalise(`${(e.also ?? []).join(' ')} glossary term definition meaning ${topic}`) };
    }),
  );
}

/**
 * The project options and the viva questions of each course, for "Go to": "Bank reconciliation statement (project)"
 * and each question, found by their words, topic and project, and opened at their place on the "Project and viva"
 * page (`/practical#option-brs`, `/practical#viva-v11-004`). Fetched, like the glossaries, when "Go to" first opens.
 */
export function practicalSearchEntries(
  practicals: readonly {
    courseId: string;
    options: readonly { id: string; number: number; title: string; short: string; summary: string }[];
    viva: readonly { id: string; question: string; topicId: string; options: readonly string[] }[];
  }[],
  courses: SearchSources['courses'],
): SearchEntry[] {
  const topicTitle = new Map(courses.flatMap((c) => c.topics.map((t) => [t.id, t.title] as const)));
  return practicals.flatMap(({ courseId, options, viva }) => {
    const short = new Map(options.map((o) => [o.id, o.short]));
    const projects = options.map((o): SearchEntry => {
      const title = `${o.title} (project)`;
      return { kind: 'project', title, detail: `Project and viva · Option ${o.number}`, href: `/practical#option-${o.id}`, courseId, key: normalise(title), terms: normalise(`project work file guide worked example ${o.short} ${o.summary}`) };
    });
    const questions = viva.map((q): SearchEntry => {
      const topic = q.topicId === 'project' ? 'The project itself' : (topicTitle.get(q.topicId) ?? '');
      return {
        kind: 'viva',
        title: q.question,
        detail: `Viva question · ${topic}`,
        href: `/practical#viva-${q.id}`,
        courseId,
        key: normalise(q.question),
        terms: normalise(`viva voce question ${topic} ${q.options.map((o) => short.get(o) ?? '').join(' ')}`),
      };
    });
    return [...projects, ...questions];
  });
}

/** The kinds of entry that open at a place on a page of their course, which `?course=` names for the other course. */
const OF_A_COURSE: ReadonlySet<SearchKind> = new Set(['term', 'project', 'viva']);

/**
 * Where an entry opens for a learner on `courseId`: its own address, but a term of the other course on the glossary
 * of that course, and a project or a viva question of the other course on its "Project and viva" page.
 */
export function entryHref(entry: Pick<SearchEntry, 'kind' | 'href' | 'courseId'>, courseId: string): string {
  if (!OF_A_COURSE.has(entry.kind) || entry.courseId === null || entry.courseId === courseId) return entry.href;
  const [path, hash] = entry.href.split('#');
  return `${path}?course=${encodeURIComponent(entry.courseId)}${hash ? `#${hash}` : ''}`;
}

const KIND_WEIGHT: Record<SearchKind, number> = { page: 8, topic: 6, lab: 5, map: 4, term: 4, project: 4, level: 3, case: 2, card: 2, viva: 1, pattern: 1 };

/** How well an entry matches the words; 0 when a word is in neither its title nor its terms. */
function score(e: SearchEntry, query: string, words: readonly string[]): number {
  let total = KIND_WEIGHT[e.kind];
  if (e.key === query) total += 200;
  else if (e.key.startsWith(query)) total += 100;
  else if (e.key.includes(query)) total += 50;
  for (const w of words) {
    if (e.key.startsWith(w) || e.key.includes(` ${w}`)) total += 20;
    else if (e.key.includes(w)) total += 10;
    else if (e.terms.includes(w)) total += 3;
    else return 0;
  }
  return total;
}

/**
 * What "Go to" shows for what is typed: entries that have every word (in any order, at the start of a word or inside
 * one), the learner's course (and the pages) before the other course, then by how well they match. With nothing
 * typed: the pages, then the topics of the learner's course.
 */
export function searchIndex(index: readonly SearchEntry[], text: string, courseId: string, limit = 40): SearchEntry[] {
  const query = normalise(text);
  const own = (e: SearchEntry) => e.courseId === null || e.courseId === courseId;
  if (query === '') {
    return [...index.filter((e) => e.kind === 'page'), ...index.filter((e) => e.kind === 'topic' && e.courseId === courseId)].slice(0, limit);
  }
  const words = query.split(' ');
  const rank = (scoreOf: (e: SearchEntry) => number) =>
    index
      .map((e, i) => ({ e, i, s: scoreOf(e) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => Number(own(b.e)) - Number(own(a.e)) || b.s - a.s || a.i - b.i)
      .slice(0, limit)
      .map((x) => x.e);
  const exact = rank((e) => score(e, query, words));
  // Nothing found: allow one slip in a word of four letters or more ("admisson" finds Admission).
  return exact.length > 0 || !words.some((w) => w.length >= 4) ? exact : rank((e) => looseScore(e, words));
}

/**
 * True when `a` becomes `b` by one letter added, dropped, changed, or two neighbours swapped (and only for words of
 * four letters or more, where one slip still leaves the word plain).
 */
export function oneSlip(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** As `score`, but a word may also be one slip away from a word of the entry (or from the start of a longer one). */
function looseScore(e: SearchEntry, words: readonly string[]): number {
  const tokens = `${e.key} ${e.terms}`.split(' ');
  let total = KIND_WEIGHT[e.kind];
  for (const w of words) {
    if (e.key.includes(w)) total += 10;
    else if (e.terms.includes(w)) total += 3;
    else if (tokens.some((t) => oneSlip(w, t) || (t.length > w.length && oneSlip(w, t.slice(0, w.length))))) total += 2;
    else return 0;
  }
  return total;
}
