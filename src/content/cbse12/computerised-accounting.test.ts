import { describe, expect, it } from 'vitest';
// The registry first: it registers every real template and installs the outline of what there is.
import { getTopicPack } from '../registry';
import { TEMPLATES, generateQuestion } from '@/generators';
import { validatePack } from '../validate';
import pack from './computerised-accounting';

// The topic of Computerised Accounting, the option of Part B (content/courseOptions.ts): what its pack and its
// templates hold. The 300-seed harness (generators.test.ts) checks every template; this checks the topic as a whole.

const T = 'computerised-accounting';
const templates = TEMPLATES.filter((t) => t.topicId === T);

describe('Computerised Accounting', () => {
  it('covers the three units of the syllabus in its concepts, and every concept has something to practise', () => {
    expect(pack.concepts.map((c) => c.id)).toEqual([
      'cas-overview', 'cas-structure', 'cas-spreadsheet', 'cas-sheet-apps', 'cas-charts', 'cas-codification', 'cas-data-entry', 'cas-final-accounts', 'cas-security', 'cas-formats',
    ]);
    for (const c of pack.concepts) expect(templates.some((t) => t.conceptId === c.id), c.id).toBe(true);
    expect(validatePack(getTopicPack(T)!)).toEqual([]);
  });

  it('has the targets of a topic: generators of every kind and difficulty, questions, cards and a ladder', () => {
    expect(templates.length).toBeGreaterThanOrEqual(40);
    const kinds = new Set(templates.map((t) => t.kind));
    for (const kind of ['mcq', 'numeric', 'journal', 'statement']) expect(kinds.has(kind as never), kind).toBe(true);
    const by = (d: string) => templates.filter((t) => t.difficulty === d).length;
    expect(by('easy')).toBeGreaterThanOrEqual(10);
    expect(by('medium')).toBeGreaterThanOrEqual(15);
    expect(by('complex')).toBeGreaterThanOrEqual(6);
    // Every template checks its own answer another way.
    for (const t of templates) expect(t.verify, t.id).toBeTypeOf('function');
    expect(pack.questions.length).toBeGreaterThanOrEqual(50);
    expect(pack.cards.length).toBeGreaterThanOrEqual(18);
    const levels = getTopicPack(T)!.levels;
    expect(levels[0].type).toBe('concept');
    expect(levels.some((l) => l.type === 'format_practice')).toBe(true);
    expect(levels.some((l) => l.type === 'challenge')).toBe(true);
    expect(levels.at(-2)!.type).toBe('look_back');
    expect(levels.at(-1)!.type).toBe('case_study');
  });

  it('gives a mock paper what its Part B needs: choice questions, worked questions of 3 and 4 marks, and a long schedule', () => {
    expect(templates.filter((t) => t.kind === 'mcq').length).toBeGreaterThanOrEqual(4);
    expect(templates.filter((t) => (t.kind === 'numeric' || t.kind === 'journal') && t.difficulty === 'medium').length).toBeGreaterThanOrEqual(4);
    expect(templates.filter((t) => (t.kind === 'numeric' || t.kind === 'journal') && t.difficulty === 'complex').length).toBeGreaterThanOrEqual(2);
    expect(templates.filter((t) => t.kind === 'statement' && t.difficulty === 'complex').map((t) => t.id)).toEqual(['cas-fmt-loan-schedule', 'cas-fmt-loan-schedule-board']);
  });

  it('states the meaning of every spreadsheet function it asks about in the question itself', () => {
    for (const [id, says] of [
      ['cas-sln', 'SLN gives'],
      ['cas-db', 'DB works out a fixed rate'],
      ['cas-db-rate', 'DB works out a fixed rate'],
      ['cas-pmt', 'PMT gives the equal instalment'],
      ['cas-if-formula', 'IF gives its second value when the condition is true'],
    ] as const) {
      for (const seed of [1, 2, 3, 4, 5]) expect(generateQuestion(id, seed).prompt, `${id} ${seed}`).toContain(says);
    }
    for (const seed of [1, 2, 3, 4, 5]) expect(generateQuestion('cas-loan-split', seed).prompt).toMatch(/(IPMT|PPMT) gives the (interest|principal) part/);
  });
});
