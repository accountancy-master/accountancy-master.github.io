import { describe, expect, it } from 'vitest';
// Every generator is registered first: a pack builds its ladder from its topic's templates as it is imported.
import '@/generators';
import { SAMPLE_ACCOUNT, SAMPLE_BRS, SAMPLE_STATEMENT } from '@/testing/sampleFormats';
import accountingEquation from './cbse11/accounting-equation';
import type { NumericQuestion, TopicPack } from './types';
import { validatePack } from './validate';

const T = 'accounting-equation';
const numeric = (change: Partial<NumericQuestion> = {}): NumericQuestion => ({
  id: 'ae-q-001', topicId: T, conceptId: 'c1', difficulty: 'easy', type: 'numeric', prompt: 'p', hints: [], explanation: 'e',
  unit: 'rupees', answer: 1250000, working: ['Step one.'], commonErrors: [{ value: 125000, why: 'Slipped a decimal place.' }],
  ...change,
});
const pack = (questions: TopicPack['questions']): TopicPack => ({
  topicId: T,
  // The topic's templates are checked too, so the pack declares every concept they use.
  concepts: [{ id: 'c1', topicId: T, title: 'C' }, ...accountingEquation.concepts],
  cards: [],
  levels: [],
  questions,
});

describe('validatePack for the newer question kinds', () => {
  it('accepts an authored numeric question and an mcq with whys', () => {
    expect(
      validatePack(
        pack([
          numeric(),
          {
            id: 'ae-q-002', topicId: T, conceptId: 'c1', difficulty: 'easy', type: 'mcq', prompt: 'p', hints: [], explanation: 'e', correct: 'a',
            options: [{ id: 'a', text: 'Right' }, { id: 'b', text: 'Wrong', why: 'A named mistake.' }],
          },
        ]),
      ),
    ).toEqual([]);
  });

  it('reports a numeric answer that is not a positive integer', () => {
    for (const answer of [0, -1, 1.5]) {
      expect(validatePack(pack([numeric({ answer })]))).toContain('question ae-q-001: answer must be a positive integer');
    }
  });

  it('reports missing working, and common errors that equal the answer or repeat', () => {
    expect(validatePack(pack([numeric({ working: [] })]))).toContain('question ae-q-001: needs working, one non-empty line per step');
    expect(validatePack(pack([numeric({ commonErrors: [{ value: 1250000, why: 'x' }] })]))).toContain(
      'question ae-q-001: a common error equals the answer',
    );
    const twice = [{ value: 5, why: 'x' }, { value: 5, why: 'y' }];
    expect(validatePack(pack([numeric({ commonErrors: twice })]))).toContain('question ae-q-001: common errors repeat a value');
    expect(validatePack(pack([numeric({ commonErrors: [{ value: 5, why: ' ' }] })]))).toContain('question ae-q-001: a common error has an empty why');
  });

  it('reports an mcq with repeated options, an empty why, or a why on the right answer', () => {
    const q = (options: { id: string; text: string; why?: string }[]): TopicPack['questions'] => [
      { id: 'ae-q-003', topicId: T, conceptId: 'c1', difficulty: 'easy', type: 'mcq', prompt: 'p', hints: [], explanation: 'e', correct: 'a', options },
    ];
    expect(validatePack(pack(q([{ id: 'a', text: 'Same' }, { id: 'b', text: 'Same' }])))).toContain('question ae-q-003: option texts are not unique');
    expect(validatePack(pack(q([{ id: 'a', text: 'R' }, { id: 'a', text: 'W' }])))).toContain('question ae-q-003: option ids are not unique');
    expect(validatePack(pack(q([{ id: 'a', text: 'R' }, { id: 'b', text: 'W', why: '' }])))).toContain('question ae-q-003: option b has an empty why');
    expect(validatePack(pack(q([{ id: 'a', text: 'R', why: 'no' }, { id: 'b', text: 'W' }])))).toContain('question ae-q-003: the correct option has a why');
  });

  it('reports a template whose concept the pack does not declare', () => {
    const p = pack([]);
    p.concepts = p.concepts.filter((c) => c.id !== 'ae-effects');
    expect(validatePack(p)).toContain('template ae-effect: unknown concept ae-effects');
  });

  it('checks the rows of an authored account and statement: labels on offer, whole rupees, totals that agree', () => {
    const own = (q: typeof SAMPLE_ACCOUNT | typeof SAMPLE_STATEMENT) => ({ ...q, topicId: T, conceptId: 'c1' });
    expect(validatePack(pack([own(SAMPLE_ACCOUNT), own(SAMPLE_STATEMENT), own(SAMPLE_BRS)]))).toEqual([]);
    const short = own({ ...SAMPLE_ACCOUNT, sides: [SAMPLE_ACCOUNT.sides[0], { ...SAMPLE_ACCOUNT.sides[1], rows: SAMPLE_ACCOUNT.sides[1].rows.slice(1) }] });
    expect(validatePack(pack([short]))).toEqual(['question sample-account: the totals do not agree']);
    const unlisted = own({ ...SAMPLE_ACCOUNT, labels: SAMPLE_ACCOUNT.labels.filter((l) => l !== 'Cash A/c') });
    expect(validatePack(pack([unlisted]))).toEqual(['question sample-account: "Cash A/c" is used but not among the labels on offer']);
    const paise = own({ ...SAMPLE_STATEMENT, rows: SAMPLE_STATEMENT.rows.map((r, i) => (i === 0 ? { ...r, amounts: [3000050, 0] } : r)) });
    expect(validatePack(pack([paise]))).toEqual([expect.stringContaining('not a positive whole number of rupees'), 'question sample-statement: the totals do not agree']);
  });
});
