import { describe, expect, it } from 'vitest';
import type { NumericQuestion, RatioQuestion, TopicPack } from '@/content/types';
import { formatSample } from '@/content/report';
import { validatePack } from '@/content/validate';
import { numericTemplate } from '@/generators/authoring';
import { buildInstance, generateFrom } from '@/generators/engine';
import { asDraft, draftFilled, draftResponse, readDraft } from '@/play/drafts';
import { describeMistake } from '@/play/mistakeText';
import { checkNumericAnswer } from '@/testing/questionChecks';
import { checkAnswer } from './checkers';
import { EXERCISE_LOGIC, NOT_RIGHT_NUMBER, NOT_RIGHT_RATIO } from './logic';
import { formatNumeric, isRatio, isRatioTerms, lowestTerms, numericKey, numericWords, parseNumeric, parseRatio, readNumeric, sameNumeric, typedNumeric } from './numeric';

const base = { topicId: 't', conceptId: 'c', difficulty: 'easy' as const, prompt: 'p', hints: [], explanation: 'e', working: ['Step.'] };

const ratio: RatioQuestion = {
  ...base,
  id: 'r1',
  type: 'numeric',
  unit: 'ratio',
  answer: [5, 3, 2],
  commonErrors: [
    { value: [3, 5, 2], why: 'Wrote the shares of the first two partners the wrong way round.' },
    { value: [1, 1, 1], why: 'Shared the profit equally.' },
  ],
};

const times: NumericQuestion = {
  ...base,
  id: 't1',
  type: 'numeric',
  unit: 'times',
  answer: 250,
  commonErrors: [
    { value: 40, why: 'Divided the liabilities by the assets.' },
    { value: 150, why: 'Deducted the liabilities before dividing.' },
  ],
};

describe('a ratio as it is held and typed', () => {
  it('is two to four whole numbers above zero, in lowest terms', () => {
    for (const good of [[3, 2], [5, 3, 2], [4, 3, 2, 1], [1, 1]]) expect(isRatio(good), String(good)).toBe(true);
    for (const bad of [[6, 4], [10, 6, 4], [3], [5, 4, 3, 2, 1], [3, 0], [3, -2], [1.5, 1], '3:2', 32, null, []]) expect(isRatio(bad), JSON.stringify(bad)).toBe(false);
    // Not yet reduced, but what a ratio is made of.
    expect(isRatioTerms([6, 4])).toBe(true);
    expect(lowestTerms([6, 4])).toEqual([3, 2]);
    expect(lowestTerms([20, 12, 8])).toEqual([5, 3, 2]);
    expect(lowestTerms([7, 5])).toEqual([7, 5]);
  });

  it('reads what is typed with colons, in the order typed, and reduces it', () => {
    expect(parseRatio('3:2', 2)).toEqual([3, 2]);
    expect(parseRatio(' 5 : 3 : 2 ', 3)).toEqual([5, 3, 2]);
    expect(parseRatio('6:4', 2)).toEqual([3, 2]);
    expect(parseRatio('10:6:4', 3)).toEqual([5, 3, 2]);
    // The order is the answer: 2:3 is another ratio.
    expect(parseRatio('2:3', 2)).toEqual([2, 3]);
    // What a number pad offers in place of a colon is read as one.
    for (const typed of ['5.3.2', '5,3,2', '5 3 2', '5-3-2', '5/3/2']) expect(parseRatio(typed, 3), typed).toEqual([5, 3, 2]);
  });

  it('reads nothing from a ratio with a number too few or too many, a blank, a zero, a fraction or a word', () => {
    for (const bad of ['', '3', '3:2:1', '3:', ':2', '3::2', '3:0', '0:2', '1.5:1', 'three:two', '3:2 or so', '-3:2']) expect(parseRatio(bad, 2), bad).toBeNull();
    expect(parseRatio('5:3', 3)).toBeNull();
    expect(parseRatio('5::2', 3)).toBeNull();
  });

  it('is written back as it is typed, and compared term by term', () => {
    expect(typedNumeric([5, 3, 2], 'ratio')).toBe('5:3:2');
    expect(formatNumeric([5, 3, 2], 'ratio')).toBe('5:3:2');
    expect(numericKey([5, 3, 2])).toBe('5:3:2');
    expect(numericKey(1250)).toBe('1250');
    expect(sameNumeric([3, 2], [3, 2])).toBe(true);
    expect(sameNumeric([3, 2], [2, 3])).toBe(false);
    expect(readNumeric(ratio, '10 : 6 : 4')).toEqual([5, 3, 2]);
    expect(readNumeric(ratio, '5:3')).toBeNull();
  });
});

describe('a ratio question', () => {
  it('is right in its lowest terms or not, and in the order the question asks for', () => {
    expect(checkAnswer(ratio, { type: 'numeric', value: parseRatio('5:3:2', 3)! })).toEqual({ correct: true });
    expect(checkAnswer(ratio, { type: 'numeric', value: parseRatio('15:9:6', 3)! })).toEqual({ correct: true });
    expect(checkAnswer(ratio, { type: 'numeric', value: parseRatio('2:3:5', 3)! }).correct).toBe(false);
  });

  it('names the mistake behind a known wrong ratio, however it is typed, and stores it in the code', () => {
    const r = checkAnswer(ratio, { type: 'numeric', value: parseRatio('6:10:4', 3)! });
    expect(r).toEqual({ correct: false, mistakeCode: 'common:3:5:2' });
    expect(EXERCISE_LOGIC.numeric.describeWrong(ratio, r.mistakeCode!)).toBe('Wrote the shares of the first two partners the wrong way round.');
    expect(describeMistake({ mistakeCode: 'common:1:1:1', hintsUsed: 0 }, ratio)).toBe('Shared the profit equally.');
    const other = checkAnswer(ratio, { type: 'numeric', value: [4, 3, 3] });
    expect(other).toEqual({ correct: false, mistakeCode: 'amount' });
    expect(EXERCISE_LOGIC.numeric.describeWrong(ratio, 'amount')).toBe(NOT_RIGHT_RATIO);
  });

  it('says the right answer as a ratio, tells the tests what to type and asks for it in words of its own', () => {
    expect(EXERCISE_LOGIC.numeric.correctAnswer(ratio)).toBe('5:3:2');
    expect(EXERCISE_LOGIC.numeric.e2eExpected(ratio)).toBe('5:3:2');
    expect(numericWords(ratio)).toEqual({ label: 'Your answer (a ratio)', placeholder: '', problem: 'Enter the ratio as whole numbers above zero, one in every box, for example 5:3:2.' });
    expect(numericWords({ unit: 'ratio', answer: [3, 2] }).problem).toContain('for example 3:2.');
    checkNumericAnswer(ratio, 'ratio');
  });

  it('is kept in a mock paper as it was typed, boxes left empty and all', () => {
    expect(draftResponse(ratio, { type: 'numeric', text: '10:6:4' })).toEqual({ type: 'numeric', value: [5, 3, 2] });
    expect(readDraft(ratio, { type: 'numeric', text: '5::2' })).toEqual({ problem: numericWords(ratio).problem });
    // Every box empty is nothing typed at all.
    expect(draftFilled({ type: 'numeric', text: '::' })).toBe(false);
    expect(readDraft(ratio, { type: 'numeric', text: '::' })).toEqual({ empty: true });
    expect(draftFilled({ type: 'numeric', text: ':3:' })).toBe(true);
    expect(asDraft(ratio, { type: 'numeric', text: '5:3:2' })).toEqual({ type: 'numeric', text: '5:3:2' });
  });

  it('is written in the content report with its unit, its working and its wrong ratios', () => {
    expect(formatSample(ratio)).toEqual([
      'Q: p',
      'A: 5:3:2   [a ratio, typed 5:3:2]',
      '   Step.',
      '   wrong 3:5:2: Wrote the shares of the first two partners the wrong way round.',
      '   wrong 1:1:1: Shared the profit equally.',
    ]);
  });
});

describe('a "times" answer', () => {
  it('is hundredths, typed with up to two decimal places', () => {
    expect(parseNumeric('2.5', 'times')).toBe(250);
    expect(parseNumeric('2.50', 'times')).toBe(250);
    expect(parseNumeric('4.85', 'times')).toBe(485);
    expect(parseNumeric('0.75', 'times')).toBe(75);
    expect(parseNumeric(' 12 ', 'times')).toBe(1200);
    // As a student may well write it: "2.5 times", "2.5 : 1".
    for (const typed of ['2.5 times', '2.5times', '2.5 : 1', '2.5:1', '2.5x', '2.5 Times']) expect(parseNumeric(typed, 'times'), typed).toBe(250);
  });

  it('is nothing with a third decimal place, a sign, a percent or words', () => {
    for (const bad of ['2.555', '-2.5', '2.5%', '2,5', 'two', '', '2.5 : 2', '.5', '2.']) expect(parseNumeric(bad, 'times'), bad).toBeNull();
  });

  it('is exact: nothing near the answer is right', () => {
    expect(checkAnswer(times, { type: 'numeric', value: 250 })).toEqual({ correct: true });
    expect(checkAnswer(times, { type: 'numeric', value: 251 })).toEqual({ correct: false, mistakeCode: 'amount' });
    expect(checkAnswer(times, { type: 'numeric', value: 249 }).correct).toBe(false);
    expect(EXERCISE_LOGIC.numeric.describeWrong(times, 'amount')).toBe(NOT_RIGHT_NUMBER);
    const r = checkAnswer(times, { type: 'numeric', value: parseNumeric('0.4', 'times')! });
    expect(r).toEqual({ correct: false, mistakeCode: 'common:40' });
    expect(EXERCISE_LOGIC.numeric.describeWrong(times, r.mistakeCode!)).toBe('Divided the liabilities by the assets.');
  });

  it('is shown as the number it is, and typed back as it is shown', () => {
    expect(typedNumeric(250, 'times')).toBe('2.5');
    expect(typedNumeric(485, 'times')).toBe('4.85');
    expect(typedNumeric(1200, 'times')).toBe('12');
    expect(typedNumeric(5, 'times')).toBe('0.05');
    expect(formatNumeric(250, 'times')).toBe('2.5');
    expect(EXERCISE_LOGIC.numeric.correctAnswer(times)).toBe('2.5');
    expect(EXERCISE_LOGIC.numeric.e2eExpected(times)).toBe('2.5');
    for (const value of [5, 75, 100, 250, 485, 1200, 33333]) expect(parseNumeric(typedNumeric(value, 'times'), 'times'), String(value)).toBe(value);
    expect(numericWords(times)).toEqual({
      label: 'Your answer (a number, up to two decimal places)',
      placeholder: 'Number',
      problem: 'Enter a number with up to two decimal places, for example 2.5.',
    });
    checkNumericAnswer(times, 'times');
  });

  it('is kept in a mock paper as it was typed', () => {
    expect(draftResponse(times, { type: 'numeric', text: '2.5 : 1' })).toEqual({ type: 'numeric', value: 250 });
    expect(readDraft(times, { type: 'numeric', text: '2.555' })).toEqual({ problem: numericWords(times).problem });
  });

  it('is written in the content report with its unit', () => {
    expect(formatSample(times).slice(0, 2)).toEqual(['Q: p', 'A: 2.5   [times, typed 2.5]']);
  });
});

describe('the older units', () => {
  it('ask for their answers in the words they always did', () => {
    expect(numericWords({ unit: 'rupees', answer: 1 })).toEqual({ label: 'Your answer in rupees (₹)', placeholder: 'Amount ₹', problem: 'Enter an amount in rupees, for example 12,500.' });
    expect(numericWords({ unit: 'number', answer: 1 })).toEqual({ label: 'Your answer (a whole number)', placeholder: 'Number', problem: 'Enter a whole number, for example 42.' });
    expect(numericWords({ unit: 'percent', answer: 1 })).toEqual({ label: 'Your answer in percent (%)', placeholder: 'Percent %', problem: 'Enter a percentage, for example 12.5.' });
  });

  it('keep the mistake codes stored attempts carry', () => {
    const q: NumericQuestion = { ...base, id: 'n1', type: 'numeric', unit: 'rupees', answer: 1250000, commonErrors: [{ value: 125000, why: 'Slipped a decimal place.' }] };
    expect(checkAnswer(q, { type: 'numeric', value: 125000 })).toEqual({ correct: false, mistakeCode: 'common:125000' });
    expect(EXERCISE_LOGIC.numeric.describeWrong(q, 'common:125000')).toBe('Slipped a decimal place.');
    expect(EXERCISE_LOGIC.numeric.describeWrong(q, 'amount')).toBe("That's not the right amount.");
    expect(EXERCISE_LOGIC.numeric.describeWrong(q, 'common:7')).toBeUndefined();
    expect(formatSample(q).slice(0, 2)).toEqual(['Q: p', 'A: ₹12,500']);
  });
});

describe('templates of the two units', () => {
  const common = { topicId: 'partnership-fundamentals', conceptId: 'x', difficulty: 'easy' as const };
  const good = { prompt: 'Asha, Bimal and Chitra share profits. Find the ratio.', explanation: ['Step.'] };

  it('make a ratio question from a ratio and wrong ratios, and a "times" question from hundredths', () => {
    const t = numericTemplate({
      id: 'test-ratio',
      ...common,
      unit: 'ratio',
      generate: () => ({ ...good, answer: [5, 3, 2], commonErrors: [{ value: [3, 5, 2], why: 'a' }, { value: [1, 1, 1], why: 'b' }] }),
      verify: (q) => q.answer.reduce((sum, n) => sum + n, 0) === 10,
    });
    const q = generateFrom(t, 4);
    expect(q).toMatchObject({ id: 'gen:test-ratio:1:4', type: 'numeric', unit: 'ratio', answer: [5, 3, 2] });
    const x = numericTemplate({ id: 'test-times', ...common, unit: 'times', generate: () => ({ ...good, answer: 250, commonErrors: [{ value: 40, why: 'a' }, { value: 150, why: 'b' }] }) });
    expect(generateFrom(x, 4)).toMatchObject({ type: 'numeric', unit: 'times', answer: 250 });
  });

  it('refuse a ratio that is not in lowest terms, has too few terms, or is not a ratio at all', () => {
    const made = (answer: number[]) =>
      buildInstance(numericTemplate({ id: 'test-ratio', ...common, unit: 'ratio', generate: () => ({ ...good, answer, commonErrors: [{ value: [3, 5, 2], why: 'a' }, { value: [1, 1, 1], why: 'b' }] }) }), 1);
    for (const bad of [[10, 6, 4], [5], [5, 3, 2, 1, 1], [5, 0, 2], [2.5, 1.5, 1]]) {
      expect(made(bad), String(bad)).toEqual({ invalid: `answer ${JSON.stringify(bad)} is not a ratio of two to four whole numbers in lowest terms` });
    }
    expect('question' in made([5, 3, 2])).toBe(true);
  });

  it('drop a wrong ratio that is the answer, repeats another, is not in lowest terms or has another number of terms', () => {
    const errors = (list: number[][]) =>
      buildInstance(numericTemplate({ id: 'test-ratio', ...common, unit: 'ratio', generate: () => ({ ...good, answer: [5, 3, 2], commonErrors: list.map((value) => ({ value, why: 'w' })) }) }), 1);
    expect(errors([[5, 3, 2], [3, 5, 2], [3, 5, 2], [6, 10, 4], [3, 2]])).toEqual({ invalid: 'only 1 usable common errors' });
    const built = errors([[5, 3, 2], [3, 5, 2], [1, 1, 1], [3, 2]]);
    if (!('question' in built) || built.question.type !== 'numeric') throw new Error('not built');
    expect(built.question.commonErrors.map((e) => e.value)).toEqual([[3, 5, 2], [1, 1, 1]]);
  });
});

describe('authored questions of the two units', () => {
  // A topic of no course, so that the pack is checked for what is in it and for nothing a real topic has.
  const T = 'a-topic-of-no-course';
  const pack = (questions: TopicPack['questions']): TopicPack => ({ topicId: T, concepts: [{ id: 'c', topicId: T, title: 'C' }], cards: [], levels: [], questions });
  const authored = (change: Partial<RatioQuestion>): RatioQuestion => ({ ...ratio, id: 'pf-q-001', topicId: T, ...change });

  it('are accepted as they should be written', () => {
    expect(validatePack(pack([authored({}), { ...times, id: 'pf-q-002', topicId: T }]))).toEqual([]);
  });

  it('are reported when the ratio or a wrong ratio is not one in lowest terms, or repeats', () => {
    expect(validatePack(pack([authored({ answer: [10, 6, 4] })]))).toContain('question pf-q-001: answer must be a ratio of two to four whole numbers in lowest terms');
    expect(validatePack(pack([authored({ commonErrors: [{ value: [3, 2], why: 'x' }] })]))).toContain(
      'question pf-q-001: a common error is not a ratio in lowest terms with as many terms as the answer',
    );
    expect(validatePack(pack([authored({ commonErrors: [{ value: [5, 3, 2], why: 'x' }] })]))).toContain('question pf-q-001: a common error equals the answer');
    expect(validatePack(pack([authored({ commonErrors: [{ value: [1, 1, 1], why: 'x' }, { value: [1, 1, 1], why: 'y' }] })]))).toContain('question pf-q-001: common errors repeat a value');
  });
});
