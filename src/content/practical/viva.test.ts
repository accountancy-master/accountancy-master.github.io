import { describe, expect, it } from 'vitest';
import COURSE_11 from './cbse11';
import type { VivaQuestion } from './types';
import { NO_FILTER, filterViva, marksFromStored, vivaCounts, vivaMatches, vivaQueue } from './viva';

const q = (id: string, over: Partial<VivaQuestion> = {}): VivaQuestion => ({
  id,
  question: `Question ${id}?`,
  answer: 'An answer.',
  topicId: 'ledger',
  options: ['comprehensive'],
  difficulty: 'easy',
  ...over,
});

describe('filterViva', () => {
  it('narrows by topic, option, difficulty and words, in the order of the bank', () => {
    const bank = [q('a'), q('b', { topicId: 'cash-book', options: ['brs'] }), q('c', { difficulty: 'complex', answer: 'Cheques issued but not presented.' })];
    expect(filterViva(bank, NO_FILTER).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(filterViva(bank, { ...NO_FILTER, topicId: 'cash-book' }).map((x) => x.id)).toEqual(['b']);
    expect(filterViva(bank, { ...NO_FILTER, optionId: 'comprehensive' }).map((x) => x.id)).toEqual(['a', 'c']);
    expect(filterViva(bank, { ...NO_FILTER, difficulty: 'complex' }).map((x) => x.id)).toEqual(['c']);
    expect(filterViva(bank, { ...NO_FILTER, query: 'not present' }).map((x) => x.id)).toEqual(['c']);
  });
  it('finds a question of the real bank by its own words', () => {
    const target = COURSE_11.viva[10];
    expect(vivaMatches(target, target.question)).toBe(true);
    expect(filterViva(COURSE_11.viva, { ...NO_FILTER, query: target.question })).toContain(target);
  });
});

describe('vivaQueue', () => {
  it('puts "Not yet" first, then the unmarked, then "I knew it", the oldest marks first', () => {
    const bank = [q('a'), q('b'), q('c'), q('d'), q('e')];
    const marks = { a: { mark: 'knew' as const, at: 5 }, c: { mark: 'notyet' as const, at: 9 }, e: { mark: 'notyet' as const, at: 2 }, d: { mark: 'knew' as const, at: 1 } };
    expect(vivaQueue(bank, marks).map((x) => x.id)).toEqual(['e', 'c', 'b', 'd', 'a']);
    expect(vivaCounts(bank, marks)).toEqual({ knew: 2, notyet: 2, unseen: 1 });
    expect(vivaQueue(bank, {}).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('marksFromStored', () => {
  it('keeps the marks and drops anything else', () => {
    expect(marksFromStored(null)).toEqual({});
    expect(marksFromStored('not json')).toEqual({});
    expect(marksFromStored('[1,2]')).toEqual({});
    expect(marksFromStored(JSON.stringify({ a: { mark: 'knew', at: 3 }, b: { mark: 'maybe', at: 1 }, c: 7 }))).toEqual({ a: { mark: 'knew', at: 3 } });
  });
});
