import { describe, expect, it } from 'vitest';
import { CARD_TITLES } from '@/content/cardTitles.generated';
import { COURSES, OUTLINES, STAGES, TEMPLATE_OUTLINES, findConceptTitle } from '@/content/outline';
import { NAV_ITEMS } from '@/components/shell/navigation';
import GLOSSARY_11 from '@/content/glossary/cbse11';
import GLOSSARY_12 from '@/content/glossary/cbse12';
import { LABS, shelfOf } from '@/simulator/labs';
import PRACTICAL_11 from '@/content/practical/cbse11';
import PRACTICAL_12 from '@/content/practical/cbse12';
import { buildSearchIndex, entryHref, glossarySearchEntries, normalise, oneSlip, practicalSearchEntries, searchIndex, type SearchEntry } from './searchIndex';

const C11 = 'cbse-11-accountancy';
const C12 = 'cbse-12-accountancy';

const index = buildSearchIndex({ courses: COURSES, outlines: OUTLINES, templates: TEMPLATE_OUTLINES, stages: STAGES, cardTitles: CARD_TITLES, pages: NAV_ITEMS });
const search = (q: string, course = C11, limit?: number) => searchIndex(index, q, course, limit);
const hrefs = (results: SearchEntry[]) => results.map((r) => r.href);

describe('normalise', () => {
  it('lowers case, drops apostrophes and punctuation and squeezes spaces', () => {
    expect(normalise("  What's   INSIDE? ")).toBe('whats inside');
    expect(normalise('Profit & Loss A/c')).toBe('profit loss a c');
  });
});

describe('the index of "Go to"', () => {
  it('has every page, every topic of both courses, every level, card, pattern and case', () => {
    const count = (kind: SearchEntry['kind']) => index.filter((e) => e.kind === kind).length;
    expect(count('page')).toBe(NAV_ITEMS.length);
    expect(count('topic')).toBe(COURSES.flatMap((c) => c.topics).filter((t) => OUTLINES.some((o) => o.topicId === t.id)).length);
    expect(count('level')).toBe(OUTLINES.reduce((n, o) => n + o.levels.length, 0));
    expect(count('card')).toBe(OUTLINES.reduce((n, o) => n + o.cards.length, 0));
    // One entry for the question types of a concept, not a row each of the same title.
    expect(count('pattern')).toBe(new Set(TEMPLATE_OUTLINES.map((t) => `${t.topicId}|${t.conceptId}`)).size);
    const titles = index.filter((e) => e.kind === 'pattern').map((e) => `${e.courseId}|${e.href.split('&')[0]}|${e.title}`);
    expect(new Set(titles).size).toBe(titles.length);
    expect(count('case')).toBe(STAGES.reduce((n, s) => n + s.cases.length, 0));
    // Every course entry says its course; a page belongs to none.
    for (const e of index) expect(e.kind === 'page' ? e.courseId : COURSES.some((c) => c.id === e.courseId), e.href).toBe(e.kind === 'page' ? null : true);
  });

  it('finds the mind map of every topic, after the topic itself', () => {
    expect(index.filter((e) => e.kind === 'map').length).toBe(index.filter((e) => e.kind === 'topic').length);
    const found = search('mind map goodwill', 'cbse-12-accountancy');
    expect(found[0]).toMatchObject({ kind: 'map', title: 'Mind map: Goodwill: Nature and Valuation', href: '/maps/goodwill' });
    const plain = search('goodwill', 'cbse-12-accountancy');
    expect(plain.findIndex((r) => r.href === '/topics/goodwill')).toBeLessThan(plain.findIndex((r) => r.href === '/maps/goodwill'));
  });

  it('finds a topic by its title, its unit and the titles of its concepts', () => {
    expect(hrefs(search('journal entries'))[0]).toBe('/topics/journal-entries');
    const unit = COURSES[0].topics.find((t) => t.id === 'ledger')!.unit;
    expect(hrefs(search(unit))).toContain('/topics/ledger');
    const concept = OUTLINES.find((o) => o.topicId === 'depreciation')!.concepts[0].title;
    expect(hrefs(search(concept).filter((r) => r.kind === 'topic'))).toContain('/topics/depreciation');
  });

  it('finds a level by its title, and plays it', () => {
    const level = OUTLINES.find((o) => o.topicId === 'ledger')!.levels.find((l) => l.order === 2)!;
    const found = search(level.title).find((r) => r.kind === 'level' && r.href === `/play/${level.id}`);
    expect(found?.detail).toContain('Level 2');
  });

  it('finds a card by what it asks, on its topic page', () => {
    const [id, title] = Object.entries(CARD_TITLES).find(([cardId]) => cardId.startsWith('je-'))!;
    const found = search(title).find((r) => r.kind === 'card');
    expect(found?.href).toBe(`/topics/journal-entries#card-${id}`);
  });

  it('forgives one slip in a word when nothing else is found', () => {
    expect(hrefs(search('admisson', C12))[0]).toBe('/topics/admission-of-a-partner');
    expect(hrefs(search('depreciaton'))).toContain('/topics/depreciation');
    expect(search('zzzzqqq')).toEqual([]);
    expect(oneSlip('admisson', 'admission')).toBe(true);
    expect(oneSlip('ledegr', 'ledger')).toBe(true);
    expect(oneSlip('cash', 'case')).toBe(true);
    expect(oneSlip('cat', 'car')).toBe(false);
    expect(oneSlip('ledger', 'leader')).toBe(false);
  });

  it('finds the question types of a concept, in the playground of its topic, and says they are question types', () => {
    const t = TEMPLATE_OUTLINES.find((x) => x.topicId === 'depreciation')!;
    const concept = findConceptTitle(t.conceptId)!;
    const found = search(concept).filter((r) => r.kind === 'pattern');
    expect(hrefs(found)).toContain(`/playground?topic=depreciation&pattern=${encodeURIComponent(t.id)}`);
    // And by the topic they belong to.
    expect(search('depreciation pattern', C11, 200).filter((r) => r.kind === 'pattern').length).toBeGreaterThan(0);
  });

  it('puts results of the learner’s course first, and still finds the other course', () => {
    const c12Topic = COURSES.find((c) => c.id === C12)!.topics.find((t) => OUTLINES.some((o) => o.topicId === t.id))!;
    const asC11 = search(c12Topic.title, C11, 200);
    expect(hrefs(asC11)).toContain(`/topics/${c12Topic.id}`);
    const firstOther = asC11.findIndex((r) => r.courseId === C12);
    const lastOwn = asC11.map((r) => r.courseId === C11 || r.courseId === null).lastIndexOf(true);
    if (firstOther >= 0 && lastOwn >= 0) expect(lastOwn).toBeLessThan(firstOther);
    expect(search(c12Topic.title, C12)[0].href).toBe(`/topics/${c12Topic.id}`);
  });

  it('needs every word to match, in any order', () => {
    expect(search('entries journal').some((r) => r.href === '/topics/journal-entries')).toBe(true);
    expect(search('journal zzzz')).toEqual([]);
  });

  it('with nothing typed, offers the pages and the topics of the course', () => {
    const empty = search('', C11, 100);
    expect(empty.slice(0, NAV_ITEMS.length).map((r) => r.kind)).toEqual(NAV_ITEMS.map(() => 'page'));
    expect(empty.filter((r) => r.kind === 'topic').every((r) => r.courseId === C11)).toBe(true);
    expect(empty.some((r) => r.kind === 'topic')).toBe(true);
  });

  it('finds a page by a word it is known by', () => {
    expect(hrefs(search('exam date'))).toContain('/settings');
    expect(hrefs(search('playground'))[0]).toBe('/playground');
  });
});

describe('the terms of the glossaries in "Go to"', () => {
  const terms = glossarySearchEntries(
    [
      { courseId: C11, entries: GLOSSARY_11 },
      { courseId: C12, entries: GLOSSARY_12 },
    ],
    COURSES,
  );
  const withTerms = [...index, ...terms];

  it('has every term of both courses, each at its place on the glossary', () => {
    expect(terms).toHaveLength(GLOSSARY_11.length + GLOSSARY_12.length);
    const goodwill = terms.find((t) => t.href === '/glossary#goodwill')!;
    expect(goodwill).toMatchObject({ kind: 'term', title: 'Goodwill (glossary)', courseId: C12 });
    expect(goodwill.detail).toBe('Glossary · Goodwill: Nature and Valuation');
  });

  it('finds a term by its name and by another name, and opens a term of the other course in that glossary', () => {
    expect(searchIndex(withTerms, 'goodwill', C12).map((r) => r.title)).toContain('Goodwill (glossary)');
    const also = GLOSSARY_11.find((e) => e.also?.length)!;
    expect(searchIndex(withTerms, also.also![0], C11).some((r) => r.href === `/glossary#${also.id}`)).toBe(true);
    const goodwill = terms.find((t) => t.href === '/glossary#goodwill')!;
    expect(entryHref(goodwill, C12)).toBe('/glossary#goodwill');
    expect(entryHref(goodwill, C11)).toBe('/glossary?course=cbse-12-accountancy#goodwill');
    expect(entryHref({ kind: 'topic', href: '/topics/goodwill', courseId: C12 }, C11)).toBe('/topics/goodwill');
  });
});

describe('the project work in "Go to"', () => {
  const entries = practicalSearchEntries([PRACTICAL_11, PRACTICAL_12], COURSES);
  const withPractical = [...index, ...entries];

  it('has every project option and every viva question of both courses, each at its place on the page', () => {
    expect(entries).toHaveLength(PRACTICAL_11.options.length + PRACTICAL_11.viva.length + PRACTICAL_12.options.length + PRACTICAL_12.viva.length);
    expect(entries.find((e) => e.href === '/practical#option-brs')).toMatchObject({ kind: 'project', title: 'Bank reconciliation statement (project)', courseId: C11 });
    const q = PRACTICAL_12.viva[0];
    expect(entries.find((e) => e.href === `/practical#viva-${q.id}`)).toMatchObject({ kind: 'viva', title: q.question, courseId: C12 });
  });

  it('finds the page, a project by its name and a question by its words, and opens one of the other course there', () => {
    expect(hrefs(searchIndex(withPractical, 'viva', C11))).toContain('/practical');
    expect(hrefs(searchIndex(withPractical, 'bank reconciliation project', C11)).slice(0, 5)).toContain('/practical#option-brs');
    const q = PRACTICAL_11.viva.find((v) => v.question.length > 40)!;
    expect(hrefs(searchIndex(withPractical, q.question, C11))).toContain(`/practical#viva-${q.id}`);
    const fsa = entries.find((e) => e.href === '/practical#option-fsa')!;
    expect(entryHref(fsa, C11)).toBe('/practical?course=cbse-12-accountancy#option-fsa');
    expect(entryHref(fsa, C12)).toBe('/practical#option-fsa');
  });
});

describe('the labs of the simulator in Go to', () => {
  const withLabs = buildSearchIndex({ courses: COURSES, outlines: OUTLINES, templates: TEMPLATE_OUTLINES, stages: STAGES, cardTitles: CARD_TITLES, pages: NAV_ITEMS, labs: shelfOf(() => true) });
  it('finds every lab offered by its topic, and opens it in the simulator', () => {
    for (const lab of shelfOf(() => true)) {
      const found = searchIndex(withLabs, lab.title, 'cbse-11-accountancy').find((e) => e.kind === 'lab' && e.title === lab.title);
      expect(found?.href, lab.id).toBe(lab.id === 'equation' ? '/simulator' : `/simulator?lab=${lab.id}`);
    }
    expect(searchIndex(withLabs, 'depreciation simulator', 'cbse-11-accountancy').some((e) => e.kind === 'lab')).toBe(LABS.some((l) => l.id === 'depreciation' && l.ready));
  });
  it('lists no lab with nothing typed', () => {
    expect(searchIndex(withLabs, '', 'cbse-11-accountancy').some((e) => e.kind === 'lab')).toBe(false);
  });
});
