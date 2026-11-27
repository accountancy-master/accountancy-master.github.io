import { describe, expect, it } from 'vitest';
import GLOSSARY_11 from './cbse11';
import GLOSSARY_12 from './cbse12';
import TIPS_11 from './tips11';
import TIPS_12 from './tips12';
import type { ExamTips, GlossaryEntry } from './types';
import { glossaryCourseOf, sentenceCount, validateGlossary, validateTips } from './validate';

const course11 = glossaryCourseOf('cbse-11-accountancy')!;
const course12 = glossaryCourseOf('cbse-12-accountancy')!;

describe('the glossary and the exam tips as written', () => {
  it('pass their checks', () => {
    expect(validateGlossary(GLOSSARY_11, course11)).toEqual([]);
    expect(validateGlossary(GLOSSARY_12, course12)).toEqual([]);
    expect(validateTips(TIPS_11, course11)).toEqual([]);
    expect(validateTips(TIPS_12, course12)).toEqual([]);
  });
});

describe('sentenceCount', () => {
  it('counts sentences, not the stops of abbreviations or figures', () => {
    expect(sentenceCount('One.')).toBe(1);
    expect(sentenceCount('One. Two? Three!')).toBe(3);
    expect(sentenceCount('Paid ₹2.5 lakh, i.e. the whole amount, to Rao & Co. in cash.')).toBe(1);
    expect(sentenceCount('Debit Cash A/c. Credit Sales A/c.')).toBe(2);
    expect(sentenceCount('No stop at the end')).toBe(0);
  });
});

describe('validateGlossary', () => {
  const entry = (over: Partial<GlossaryEntry>): GlossaryEntry => ({
    id: 'goodwill',
    term: 'Goodwill',
    definition: 'The value of the reputation of a firm.',
    topicId: 'goodwill',
    conceptId: 'gw-nature',
    ...over,
  });
  const check = (...entries: GlossaryEntry[]) => validateGlossary(entries, course12);

  it('accepts a well-formed entry', () => {
    expect(check(entry({}))).toEqual([]);
  });
  it('reports a duplicate id and an id that is not kebab-case', () => {
    expect(check(entry({}), entry({ term: 'Other' }))).toContain('glossary cbse-12-accountancy: goodwill: duplicate id');
    expect(check(entry({ id: 'Good Will' }))[0]).toMatch(/kebab-case/);
  });
  it('reports a missing term and a term defined twice, also under another name', () => {
    expect(check(entry({ term: '' }))[0]).toMatch(/has no term/);
    expect(check(entry({}), entry({ id: 'goodwill-2', term: 'goodwill' }))[0]).toMatch(/"goodwill" is already defined by goodwill/);
    expect(check(entry({ also: ['Firm reputation'] }), entry({ id: 'rep', term: 'Firm Reputation' }))[0]).toMatch(/already defined by goodwill/);
  });
  it('wants one to three sentences of definition', () => {
    expect(check(entry({ definition: '' }))[0]).toMatch(/has no definition/);
    expect(check(entry({ definition: 'No full stop' }))[0]).toMatch(/one to three sentences.*has 0/);
    expect(check(entry({ definition: 'One. Two. Three. Four.' }))[0]).toMatch(/has 4/);
  });
  it('reports a topic of another course and a concept of another topic', () => {
    expect(check(entry({ topicId: 'journal-entries', conceptId: undefined }))[0]).toMatch(/journal-entries is not a topic of cbse-12-accountancy/);
    expect(check(entry({ conceptId: 'pf-features' }))[0]).toMatch(/pf-features is not a concept of goodwill/);
  });
  it('reports a see-also that is not an entry', () => {
    expect(check(entry({ seeAlso: ['nowhere'] }))[0]).toMatch(/see also nowhere is not an entry/);
  });
});

describe('validateTips', () => {
  const tips = (over: Partial<ExamTips>): ExamTips => ({ courseId: 'cbse-11-accountancy', general: ['Read the paper.'], sections: [], mistakes: [], ...over });
  it('accepts sections of the paper and its parts', () => {
    expect(validateTips(tips({ sections: [{ title: 'Accounting Process', tips: ['A.'] }, { title: 'Part B', tips: ['B.'] }] }), course11)).toEqual([]);
  });
  it('reports a section the paper does not have, an unknown topic, another course and an empty tip', () => {
    expect(validateTips(tips({ sections: [{ title: 'Section Z', tips: ['A.'] }] }), course11)[0]).toMatch(/"Section Z" is not a section/);
    expect(validateTips(tips({ mistakes: [{ topicId: 'goodwill', text: 'x' }] }), course11)[0]).toMatch(/goodwill is not a topic/);
    expect(validateTips(tips({ courseId: 'cbse-12-accountancy' }), course11)[0]).toMatch(/are of cbse-12/);
    expect(validateTips(tips({ general: [' '] }), course11)[0]).toMatch(/a tip is empty/);
  });
});
