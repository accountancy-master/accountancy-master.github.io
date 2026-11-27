import { describe, expect, it } from 'vitest';
import type { McqQuestion, NumericQuestion } from '@/content/types';
import { describeMistake, describeWrong } from '@/play/mistakeText';
import { REVEALED_HINTS } from '@/play/session';
import { checkAnswer } from './checkers';
import { SAMPLE_SET, reversed } from '@/testing/sampleSet';
import { SAMPLE_ACCOUNT, SAMPLE_STATEMENT, rightFormat } from '@/testing/sampleFormats';
import { EXERCISE_LOGIC, SET_ENTRY_EMPTY, SET_ENTRY_RIGHT, answerToKeep, logicFor, readSetCode, setEntryHeading, setScoreText, type Response } from './logic';

const mcq: McqQuestion = {
  id: 'm1', topicId: 't', conceptId: 'c', difficulty: 'easy', type: 'mcq', prompt: 'p', hints: [], explanation: 'e',
  options: [
    { id: 'a', text: 'Right' },
    { id: 'b', text: 'Wrong with a reason', why: 'Mixed up debit and credit.' },
    { id: 'c', text: 'Wrong with none' },
  ],
  correct: 'a',
};

const numeric: NumericQuestion = {
  id: 'n1', topicId: 't', conceptId: 'c', difficulty: 'easy', type: 'numeric', prompt: 'p', hints: [], explanation: 'e',
  unit: 'rupees', answer: 1250000, working: ['Step.'],
  commonErrors: [{ value: 125000, why: 'Slipped a decimal place.' }],
};

describe('the answer an attempt keeps', () => {
  const keptOf = (q: Parameters<typeof checkAnswer>[0], r: Response) => answerToKeep(r, checkAnswer(q, r));

  it('is the answer to a set, an account or a statement that was not right, as it was checked', () => {
    const set: Response = { type: 'journal_set', entries: SAMPLE_SET.entries.map((e, i) => (i === 1 ? reversed(e.expected) : e.expected)) };
    expect(keptOf(SAMPLE_SET, set)).toBe(set);
    const account = rightFormat(SAMPLE_ACCOUNT);
    if (account.type !== 'account') throw new Error('not an account');
    const short: Response = { ...account, sides: [account.sides[0].slice(1), account.sides[1]] };
    expect(keptOf(SAMPLE_ACCOUNT, short)).toBe(short);
    const statement = rightFormat(SAMPLE_STATEMENT);
    if (statement.type !== 'statement') throw new Error('not a statement');
    const fewer: Response = { ...statement, rows: statement.rows.slice(1) };
    expect(keptOf(SAMPLE_STATEMENT, fewer)).toBe(fewer);
  });

  it('is nothing for a right answer, and nothing for a short question, right or wrong', () => {
    expect(keptOf(SAMPLE_SET, { type: 'journal_set', entries: SAMPLE_SET.entries.map((e) => e.expected) })).toBeUndefined();
    expect(keptOf(SAMPLE_ACCOUNT, rightFormat(SAMPLE_ACCOUNT))).toBeUndefined();
    expect(keptOf(SAMPLE_STATEMENT, rightFormat(SAMPLE_STATEMENT))).toBeUndefined();
    expect(keptOf(mcq, { type: 'mcq', optionId: 'b' })).toBeUndefined();
    expect(keptOf(numeric, { type: 'numeric', value: 5 })).toBeUndefined();
    expect(answerToKeep({ type: 'journal_entry', lines: [] }, { correct: false })).toBeUndefined();
    expect(answerToKeep({ type: 'true_false', value: true }, { correct: false })).toBeUndefined();
  });
});

describe('mcq with a why on a wrong option', () => {
  it('reports a code for the option and words it', () => {
    const r = checkAnswer(mcq, { type: 'mcq', optionId: 'b' });
    expect(r).toEqual({ correct: false, mistakeCode: 'option:b' });
    expect(describeWrong(mcq, r.mistakeCode)).toBe('Mixed up debit and credit.');
    expect(describeMistake({ mistakeCode: r.mistakeCode, hintsUsed: 0 }, mcq)).toBe('Mixed up debit and credit.');
  });
  it('gives no code for a wrong option without one, and none when right', () => {
    expect(checkAnswer(mcq, { type: 'mcq', optionId: 'c' })).toEqual({ correct: false });
    expect(checkAnswer(mcq, { type: 'mcq', optionId: 'a' })).toEqual({ correct: true });
  });
  it('says nothing for a code it does not know', () => {
    expect(describeWrong(mcq, 'option:zzz')).toBeUndefined();
    expect(describeWrong(mcq, 'sidesReversed')).toBeUndefined();
  });
});

describe('numeric', () => {
  it('checks the exact amount', () => {
    expect(checkAnswer(numeric, { type: 'numeric', value: 1250000 })).toEqual({ correct: true });
  });
  it('names the mistake behind a known wrong amount', () => {
    const r = checkAnswer(numeric, { type: 'numeric', value: 125000 });
    expect(r).toEqual({ correct: false, mistakeCode: 'common:125000' });
    expect(describeWrong(numeric, r.mistakeCode)).toBe('Slipped a decimal place.');
  });
  it('says the amount is not right for any other wrong amount', () => {
    const r = checkAnswer(numeric, { type: 'numeric', value: 7 });
    expect(r.correct).toBe(false);
    expect(describeWrong(numeric, r.mistakeCode)).toBe("That's not the right amount.");
  });
  it('shows the right answer in the unit, and what the e2e tests type', () => {
    expect(EXERCISE_LOGIC.numeric.correctAnswer(numeric)).toBe('₹12,500');
    expect(EXERCISE_LOGIC.numeric.e2eExpected(numeric)).toBe('12500');
    expect(logicFor(numeric)).toBe(EXERCISE_LOGIC.numeric);
  });
  it('rejects a response of another type', () => {
    expect(() => checkAnswer(numeric, { type: 'mcq', optionId: 'a' })).toThrow('Response type mcq does not match question type numeric');
  });
});

describe('a set of journal entries', () => {
  const right = SAMPLE_SET.entries.map((e) => e.expected);
  const answer = (entries: typeof right) => checkAnswer(SAMPLE_SET, { type: 'journal_set', entries });

  it('is right only when every entry is right, and says how many were', () => {
    const all = answer(right);
    expect(all).toMatchObject({ correct: true, parts: { right: 4, total: 4 } });
    expect(all.mistakeCode).toBeUndefined();
    expect(all.set!.every((c) => c.correct)).toBe(true);
    // The lines of an entry may come in any order, as for a single entry.
    expect(answer(right.map((lines) => [...lines].reverse())).correct).toBe(true);
  });

  it('compares each entry as a single entry is compared, and says which were wrong and how', () => {
    const lessDiscount = [right[3][0], { ...right[3][1], amount: 4000000 }];
    const result = answer([right[0], reversed(right[1]), right[2], lessDiscount]);
    expect(result).toMatchObject({ correct: false, parts: { right: 2, total: 4 }, mistakeCode: 'set:ok,sidesReversed,ok,wrongAmount' });
    expect(result.set!.map((c) => c.correct)).toEqual([true, false, true, false]);
    expect(result.set![1].lines.map((l) => l.status)).toEqual(['sidesReversed', 'sidesReversed']);
    expect(result.set![3]).toMatchObject({ mistake: 'wrongAmount', missing: [right[3][2]] });
    // An entry written under another transaction is wrong there: the entries are not matched across dates.
    expect(answer([right[1], right[0], right[2], right[3]]).parts).toEqual({ right: 2, total: 4 });
  });

  it('counts an entry left empty as not right, and tells it apart from a wrong one', () => {
    const result = answer([right[0], [], right[2]]);
    expect(result).toMatchObject({ correct: false, parts: { right: 2, total: 4 }, mistakeCode: 'set:ok,empty,ok,empty' });
    expect(answer([[], [], [], []])).toMatchObject({ correct: false, parts: { right: 0, total: 4 } });
    // Entries beyond the set are ignored.
    expect(answer([...right, right[0]]).correct).toBe(true);
  });

  it('puts the result in words, and reads it back from the stored code', () => {
    const { mistakeCode } = answer([right[0], reversed(right[1]), [], right[3]]);
    expect(describeWrong(SAMPLE_SET, mistakeCode)).toBe('2 of 4 entries right.');
    expect(describeMistake({ mistakeCode, hintsUsed: 0 }, SAMPLE_SET)).toBe('2 of 4 entries right.');
    expect(describeMistake({ mistakeCode, hintsUsed: REVEALED_HINTS }, SAMPLE_SET)).toBe('Answer was shown');
    expect(readSetCode(mistakeCode, 4)).toEqual([SET_ENTRY_RIGHT, 'sidesReversed', SET_ENTRY_EMPTY, SET_ENTRY_RIGHT]);
    expect(setScoreText(4, 5)).toBe('4 of 5 entries right');
    // A code of another set (the question has changed since), or of another type, says nothing.
    expect(readSetCode(mistakeCode, 5)).toBeNull();
    expect(readSetCode('wrongAmount', 4)).toBeNull();
    expect(readSetCode(undefined, 4)).toBeNull();
    expect(describeWrong(SAMPLE_SET, 'set:ok,ok')).toBeUndefined();
    expect(describeMistake({ mistakeCode: 'set:ok,ok', hintsUsed: 0 }, SAMPLE_SET)).toBe('The answer was not right.');
  });

  it('heads an item with its date, or with its label when it has no date', () => {
    expect(SAMPLE_SET.entries.map(setEntryHeading)).toEqual(['1 April', '3 April', '5 April', '6 April']);
    expect(setEntryHeading({ label: 'Error 1' })).toBe('Error 1');
    // Labelled items are checked exactly as dated ones are.
    const labelled = { ...SAMPLE_SET, entries: SAMPLE_SET.entries.map((e, i) => ({ label: `(${'abcd'[i]})`, text: e.text, expected: e.expected, explanation: e.explanation })) };
    expect(labelled.entries.map(setEntryHeading)).toEqual(['(a)', '(b)', '(c)', '(d)']);
    expect(checkAnswer(labelled, { type: 'journal_set', entries: [right[0], reversed(right[1]), right[2], right[3]] })).toMatchObject({
      correct: false,
      mistakeCode: 'set:ok,sidesReversed,ok,ok',
    });
  });

  it('has no single right answer in words, shares its marks among its entries, and tells the e2e tests every entry', () => {
    const logic = logicFor(SAMPLE_SET);
    expect(logic.correctAnswer(SAMPLE_SET)).toBeNull();
    expect(logic.parts?.(SAMPLE_SET)).toEqual({ count: 4, name: 'entries' });
    expect(logic.e2eExpected(SAMPLE_SET)).toEqual({ entries: right });
    expect(JSON.parse(JSON.stringify(logic.e2eExpected(SAMPLE_SET)))).toEqual({ entries: right });
    // The other types are one answer each.
    expect(logicFor(mcq).parts).toBeUndefined();
    expect(() => checkAnswer(SAMPLE_SET, { type: 'journal_entry', lines: right[0] })).toThrow('Response type journal_entry does not match question type journal_set');
  });
});

describe('describeMistake', () => {
  it('keeps the journal wording, and says the answer was shown whatever the code', () => {
    expect(describeMistake({ mistakeCode: 'wrongAmount', hintsUsed: 0 })).toBe('An amount is not right.');
    expect(describeMistake({ mistakeCode: 'option:b', hintsUsed: REVEALED_HINTS }, mcq)).toBe('Answer was shown');
  });
  it('falls back to the plain line when the question cannot word the code', () => {
    expect(describeMistake({ mistakeCode: 'option:zzz', hintsUsed: 1 }, mcq)).toBe('The answer was not right.');
    expect(describeMistake({ hintsUsed: 0 }, numeric)).toBe('The answer was not right.');
  });
});
