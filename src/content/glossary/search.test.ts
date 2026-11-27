import { describe, expect, it } from 'vitest';
import { bestMatch, filterGlossary, glossaryScore, letterOf, lettersOf, sortGlossary } from './search';
import type { GlossaryEntry } from './types';

const entry = (id: string, term: string, definition: string, topicId = 'goodwill', also?: string[]): GlossaryEntry => ({ id, term, definition, topicId, ...(also ? { also } : {}) });

const ENTRIES: GlossaryEntry[] = [
  entry('super-profit', 'Super profit', 'Profit above the normal profit of a firm.'),
  entry('goodwill', 'Goodwill', 'The value of the reputation of a firm.'),
  entry('debentures', 'Debenture', 'A written acknowledgement of a debt of a company.', 'debentures'),
  entry('trade-receivables', 'Trade receivables', 'Amounts due from customers for goods sold on credit.', 'accounting-ratios', ['Debtors', 'Sundry debtors']),
  entry('average-profit', 'average profit', 'The total of the profits of past years divided by the number of years.'),
  entry('3-column', '3-column cash book', 'A cash book with cash, bank and discount columns.', 'goodwill'),
];
const UNITS: Record<string, string> = { goodwill: 'Partnership', debentures: 'Companies', 'accounting-ratios': 'Analysis' };
const unitOf = (topicId: string) => UNITS[topicId];
const ids = (list: GlossaryEntry[]) => list.map((e) => e.id);

describe('the glossary A to Z', () => {
  it('sorts by term whatever the case, with terms that start with a figure first', () => {
    expect(ids(sortGlossary(ENTRIES))).toEqual(['3-column', 'average-profit', 'debentures', 'goodwill', 'super-profit', 'trade-receivables']);
  });
  it('puts a term under its first letter, and lists the letters that have terms', () => {
    expect(letterOf('goodwill')).toBe('G');
    expect(letterOf(' Écart')).toBe('#');
    expect(letterOf('3-column cash book')).toBe('#');
    expect(lettersOf(ENTRIES)).toEqual(['#', 'A', 'D', 'G', 'S', 'T']);
  });
});

describe('glossary search', () => {
  const all = { query: '', unit: '', topicId: '' };
  it('finds a term by its name, by another name and by its definition', () => {
    expect(ids(filterGlossary(ENTRIES, { ...all, query: 'goodwill' }, unitOf))).toEqual(['goodwill']);
    expect(ids(filterGlossary(ENTRIES, { ...all, query: 'debtors' }, unitOf))).toEqual(['trade-receivables']);
    expect(ids(filterGlossary(ENTRIES, { ...all, query: 'reputation' }, unitOf))).toEqual(['goodwill']);
    // Every word must be found; together they narrow.
    expect(ids(filterGlossary(ENTRIES, { ...all, query: 'profit normal' }, unitOf))).toEqual(['super-profit']);
    expect(filterGlossary(ENTRIES, { ...all, query: 'zebra' }, unitOf)).toEqual([]);
  });
  it('ranks a match in the term above one in the definition', () => {
    expect(glossaryScore(ENTRIES[0], 'profit')).toBeGreaterThan(glossaryScore(ENTRIES[1], 'firm'));
    expect(bestMatch(ENTRIES, 'profit')?.id).toBe('average-profit');
    expect(bestMatch(ENTRIES, 'super')?.id).toBe('super-profit');
    expect(bestMatch(ENTRIES, '')).toBeUndefined();
  });
  it('filters by unit and by topic', () => {
    expect(ids(filterGlossary(ENTRIES, { ...all, unit: 'Companies' }, unitOf))).toEqual(['debentures']);
    expect(ids(filterGlossary(ENTRIES, { ...all, topicId: 'accounting-ratios' }, unitOf))).toEqual(['trade-receivables']);
    expect(ids(filterGlossary(ENTRIES, { query: 'profit', unit: 'Partnership', topicId: 'goodwill' }, unitOf))).toEqual(['average-profit', 'super-profit']);
  });
});
