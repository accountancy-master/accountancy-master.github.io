import { describe, expect, it } from 'vitest';
import '@/content/registry';
import { findConceptTitle, stagesOf, templateOutlinesOf } from '@/content/outline';
import type { TemplateOutline } from '@/generators/types';
import {
  DIFFICULTY_WORD,
  NO_FILTERS,
  PATTERN_KINDS,
  coursePatterns,
  filterPatterns,
  filtersFromQuery,
  filtersToQuery,
  findPattern,
  patternKindOf,
  patternTitle,
  playFromQuery,
  scaleLine,
  type Pattern,
} from './patterns';

const CLASS11 = 'cbse-11-accountancy';
const CLASS12 = 'cbse-12-accountancy';
const query = (s: string) => new URLSearchParams(s);

const t = (id: string, kind: TemplateOutline['kind'], difficulty: TemplateOutline['difficulty']): TemplateOutline => ({
  id,
  version: 1,
  topicId: 'partnership-fundamentals',
  conceptId: 'pf-iod',
  difficulty,
  kind,
});

describe('the title of a pattern', () => {
  const siblings = [t('a', 'numeric', 'medium'), t('b', 'journal', 'easy'), t('c', 'numeric', 'medium'), t('d', 'numeric', 'complex')];

  it('is the concept, then how hard and what kind of question it is', () => {
    expect(patternTitle(siblings[1], 'Interest on drawings', siblings)).toBe('Interest on drawings: easy journal entry');
    expect(patternTitle(siblings[3], 'Interest on drawings', siblings)).toBe('Interest on drawings: challenging calculation');
  });

  it('numbers the patterns of a concept that would otherwise share a title, in registry order', () => {
    expect(patternTitle(siblings[0], 'Interest on drawings', siblings)).toBe('Interest on drawings: standard calculation 1');
    expect(patternTitle(siblings[2], 'Interest on drawings', siblings)).toBe('Interest on drawings: standard calculation 2');
  });

  it('names every kind of template in words', () => {
    const kinds: TemplateOutline['kind'][] = ['mcq', 'numeric', 'journal', 'journal_set', 'account', 'statement'];
    const titles = kinds.map((kind) => patternTitle(t(kind, kind, 'easy'), 'X', [t(kind, kind, 'easy')]));
    expect(titles).toEqual(['X: easy choice question', 'X: easy calculation', 'X: easy journal entry', 'X: easy set of entries', 'X: easy account to prepare', 'X: easy statement to prepare']);
    expect(Object.keys(DIFFICULTY_WORD)).toEqual(['easy', 'medium', 'complex']);
  });

  it('is the authored title where there is one', () => {
    expect(patternTitle(siblings[0], 'Interest on drawings', siblings, { a: 'Interest on drawings by the average period' })).toBe(
      'Interest on drawings by the average period',
    );
  });
});

describe('the patterns of a course', () => {
  for (const courseId of [CLASS11, CLASS12]) {
    const patterns = coursePatterns(courseId);
    const templates = templateOutlinesOf(courseId);
    const cases = stagesOf(courseId).flatMap((s) => s.cases);

    it(`${courseId}: every template and every case study, once, templates in course order then the cases`, () => {
      expect(patterns.map((p) => p.id)).toEqual([...templates.map((x) => x.id), ...cases.map((c) => c.id)]);
      expect(patterns.length).toBeGreaterThan(500);
    });

    it(`${courseId}: every title is readable and none is shared within a topic`, () => {
      for (const p of patterns) {
        expect(p.title.length, p.id).toBeGreaterThan(5);
        if (p.kind !== 'case') expect(p.title.startsWith(findConceptTitle(p.conceptId)!), p.id).toBe(true);
      }
      const seen = new Set<string>();
      for (const p of patterns) {
        const key = `${p.topicId}\n${p.title}`;
        expect(seen.has(key), `${p.id}: ${p.title}`).toBe(false);
        seen.add(key);
      }
    });

    it(`${courseId}: a case study is a pattern of its stage, with the kinds of its parts`, () => {
      for (const c of cases) {
        const p = findPattern(c.id)!;
        expect(p).toMatchObject({ kind: 'case', title: c.title, topicId: c.topicId, parts: c.parts.map((x) => x.kind) });
        expect(p.stageId).toBeDefined();
      }
    });
  }

  it('is the same list every time it is asked for, and none for an unknown course', () => {
    expect(coursePatterns(CLASS11)).toBe(coursePatterns(CLASS11));
    expect(coursePatterns('no-such-course')).toEqual([]);
  });

  it('sorts the kinds of template into the kinds a learner filters by', () => {
    expect(patternKindOf('mcq')).toBe('quick');
    expect(patternKindOf('numeric')).toBe('quick');
    expect(patternKindOf('journal')).toBe('journal');
    expect(patternKindOf('journal_set')).toBe('set');
    expect(patternKindOf('account')).toBe('format');
    expect(patternKindOf('statement')).toBe('format');
    expect(PATTERN_KINDS).toEqual(['quick', 'journal', 'set', 'format', 'case']);
  });

  it('says how many there are', () => {
    expect(scaleLine(1240)).toBe('1,240 question types · unlimited questions');
    expect(scaleLine(1)).toBe('1 question type · unlimited questions');
  });
});

describe('filtering the patterns', () => {
  const all = coursePatterns(CLASS11);
  const ledger = all.filter((p) => p.topicId === 'ledger');

  it('keeps everything with no filter', () => {
    expect(filterPatterns(all, NO_FILTERS)).toEqual(all);
  });

  it('by topic, kind and difficulty together', () => {
    const found = filterPatterns(all, { ...NO_FILTERS, topics: ['ledger', 'cash-book'], kinds: ['journal', 'format'], difficulties: ['easy'] });
    expect(found.length).toBeGreaterThan(0);
    for (const p of found) {
      expect(['ledger', 'cash-book']).toContain(p.topicId);
      expect(['journal', 'format']).toContain(p.kind);
      expect(p.difficulty).toBe('easy');
    }
    expect(found.some((p) => p.topicId === 'ledger')).toBe(true);
  });

  it('by words, every one of which is in the title, the topic or the kind, in any case', () => {
    const word = ledger[0].title.split(':')[0].split(' ')[0];
    const found = filterPatterns(all, { ...NO_FILTERS, q: `  ${word.toUpperCase()}   ledger ` });
    expect(found.length).toBeGreaterThan(0);
    for (const p of found) expect(`${p.title} ledger`.toLowerCase()).toContain(word.toLowerCase());
    expect(filterPatterns(all, { ...NO_FILTERS, q: 'zzzz-nothing' })).toEqual([]);
    // A case study is found by its kind.
    const cases = all.filter((p: Pattern) => p.kind === 'case');
    expect(cases.length).toBeGreaterThan(0);
    expect(filterPatterns(all, { ...NO_FILTERS, q: 'case study' })).toEqual(expect.arrayContaining(cases));
  });

  it('lists the patterns beyond the syllabus with their reason, and finds them by those words', () => {
    const beyond = all.filter((p) => p.beyondSyllabus !== undefined);
    expect(beyond.map((p) => p.id).sort()).toEqual([
      'faa-closing-capital',
      'faa-entry-int-drawings',
      'faa-int-drawings',
      'faa-int-drawings-regular',
      'je-interest-drawings',
      'je-interest-drawings-amount',
      'thb-gst-cross-set-off',
    ]);
    expect(filterPatterns(all, { ...NO_FILTERS, q: 'beyond the syllabus' })).toEqual(beyond);
  });

  it('by the sample of a pattern, where the samples are known', () => {
    const p = ledger[0];
    const found = filterPatterns(all, { ...NO_FILTERS, q: 'xylophone' }, { [p.id]: 'A xylophone was bought for cash.' });
    expect(found).toEqual([p]);
  });
});

describe('the address of the Playground', () => {
  it('reads the filters, the single topic of a search link among them', () => {
    expect(filtersFromQuery(query(''))).toEqual(NO_FILTERS);
    expect(filtersFromQuery(query('topic=ledger&pattern=x'))).toEqual({ ...NO_FILTERS, topics: ['ledger'] });
    expect(filtersFromQuery(query('q=cash+book&topics=ledger,cash-book&kinds=journal,nonsense,case&difficulty=easy,hard'))).toEqual({
      q: 'cash book',
      topics: ['ledger', 'cash-book'],
      kinds: ['journal', 'case'],
      difficulties: ['easy'],
    });
  });

  it('writes them back in one order, leaving out what is not set', () => {
    expect(filtersToQuery(NO_FILTERS)).toBe('');
    const filters = { q: 'cash book', topics: ['ledger', 'cash-book'], kinds: ['case', 'journal'] as Pattern['kind'][], difficulties: ['complex', 'easy'] as Pattern['difficulty'][] };
    const written = filtersToQuery(filters);
    expect(written).toBe('q=cash%20book&topics=ledger,cash-book&kinds=journal,case&difficulty=easy,complex');
    expect(filtersFromQuery(query(written))).toEqual({ ...filters, kinds: ['journal', 'case'], difficulties: ['easy', 'complex'] });
  });

  it('says what is played: one pattern, the patterns chosen, or every pattern shown', () => {
    expect(playFromQuery(query('topic=ledger'))).toBeNull();
    expect(playFromQuery(query('topic=ledger&pattern=led-post'))).toEqual({ kind: 'pattern', id: 'led-post' });
    expect(playFromQuery(query('mix=a,b,,a'))).toEqual({ kind: 'mix', ids: ['a', 'b'] });
    expect(playFromQuery(query('mix=shown&topics=ledger'))).toEqual({ kind: 'shown' });
    expect(playFromQuery(query('mix='))).toBeNull();
  });
});
