import { describe, expect, it } from 'vitest';
import WRITTEN_11 from './cbse11';
import WRITTEN_12 from './cbse12';
import type { WrittenQuestion } from './types';
import { thinTopics, validateWritten } from './validate';

describe('the board-style written answers', () => {
  it('pass their checks', () => {
    expect(validateWritten(WRITTEN_11, 'w11')).toEqual([]);
    expect(validateWritten(WRITTEN_12, 'w12')).toEqual([]);
  });

  it.skipIf(WRITTEN_11.length === 0)('cover every taught topic of Class 11', () => expect(thinTopics(WRITTEN_11, 'w11')).toEqual([]));
  it.skipIf(WRITTEN_12.length === 0)('cover every taught topic of Class 12', () => expect(thinTopics(WRITTEN_12, 'w12')).toEqual([]));
});

describe('validateWritten', () => {
  const good: WrittenQuestion = {
    id: 'w11-pr-001',
    topicId: 'provisions-and-reserves',
    conceptId: 'pr-difference',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between a provision and a reserve on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'A provision is a charge against profit; a reserve is an appropriation of profit.', keywords: ['charge against profit', 'appropriation'] },
      { text: 'A provision is made for a known liability or loss; a reserve strengthens the financial position.', keywords: ['known liability', 'strengthen'] },
      { text: 'A provision is made even when there is a loss; a reserve only out of profit.', keywords: ['even when', 'only out of profit'] },
    ],
    table: {
      headers: ['Basis', 'Provision', 'Reserve'],
      rows: [
        ['Nature', 'A charge against profit', 'An appropriation of profit'],
        ['Purpose', 'Meets a known liability or loss', 'Strengthens the financial position'],
        ['When made', 'Even when there is a loss', 'Only out of profit'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; a side without its basis earns half.',
    hints: ['Think of where each appears: the Profit and Loss Account or its Appropriation.', 'Bases: nature, purpose, when made.'],
  };
  const bad = (over: Partial<WrittenQuestion>) => validateWritten([{ ...good, ...over }], 'w11');

  it('accepts a well-formed question', () => expect(validateWritten([good], 'w11')).toEqual([]));

  it('catches the usual faults', () => {
    expect(bad({ id: 'w12-pr-001' })).toEqual([expect.stringContaining('id should look like')]);
    expect(bad({ conceptId: 'je-rules' })).toEqual([expect.stringContaining('not a concept of')]);
    expect(bad({ topicId: 'goodwill', conceptId: 'x' })).toEqual([expect.stringContaining('not a topic of')]);
    expect(bad({ pointsNeeded: 4 })).toEqual([expect.stringContaining('fewer points'), expect.stringContaining('do not split')]);
    expect(bad({ table: undefined })).toEqual([expect.stringContaining('needs a table')]);
    expect(bad({ form: 'features', table: undefined })).toEqual([expect.stringContaining('needs a model answer')]);
    expect(bad({ markingTip: 'Give her a mark.' })).toEqual([expect.stringContaining('gendered pronoun')]);
    expect(bad({ points: [{ text: 'x', keywords: ['Upper'] }, ...good.points.slice(1)] })).toEqual([expect.stringContaining('lower case')]);
    expect(validateWritten([good, good], 'w11')).toEqual([expect.stringContaining('used twice'), expect.stringContaining('asked twice')]);
  });
});
