import { describe, expect, it } from 'vitest';
import type { EnteredRow } from '@/engine/formats';
import { caseMarks } from '@/learning/mockPaper';
import { SAMPLE_ACCOUNT, SAMPLE_BRS, SAMPLE_STATEMENT, SAMPLE_SUSPENSE, rightFormat } from '@/testing/sampleFormats';
import { checkAnswer } from './checkers';
import { expectedRows, extraRowsText, formatLists, formatScoreText, logicFor, readFormatCode, rowsCounted, type Response } from './logic';

type AccountResponse = Extract<Response, { type: 'account' }>;
type StatementResponse = Extract<Response, { type: 'statement' }>;
const got = (label: string, ...rupees: number[]): EnteredRow => ({ label, amounts: rupees.map((r) => r * 100) });
const account = () => structuredClone(rightFormat(SAMPLE_ACCOUNT)) as AccountResponse;
const statement = (q = SAMPLE_STATEMENT) => structuredClone(rightFormat(q)) as StatementResponse;

describe('checking an account', () => {
  it('lists its rows side by side and then below the totals, and counts every one', () => {
    expect(formatLists(SAMPLE_ACCOUNT).map((l) => l.length)).toEqual([3, 2, 0, 1]);
    expect(expectedRows(SAMPLE_ACCOUNT).map((e) => [e.row.label, e.side, e.below ?? false])).toEqual([
      ['Purchases Return A/c', 0, false],
      ['Cash A/c', 0, false],
      ['Balance c/d', 0, false],
      ['Balance b/d', 1, false],
      ['Purchases A/c', 1, false],
      ['Balance b/d', 1, true],
    ]);
    expect(logicFor(SAMPLE_ACCOUNT).parts!(SAMPLE_ACCOUNT)).toEqual({ count: 6, name: 'rows' });
  });

  it('is right when every row is there with its amount on its side, in any order, and nothing else', () => {
    const r = account();
    r.sides[0].reverse();
    const result = checkAnswer(SAMPLE_ACCOUNT, r);
    expect(result).toMatchObject({ correct: true, parts: { right: 6, total: 6 } });
    expect(result.mistakeCode).toBeUndefined();
    expect(result.format).toMatchObject({ right: 6, total: 6, extra: 0 });
  });

  it('records which rows were right, which were missing or wrong, and which were extra', () => {
    const r = account();
    // The purchase on the wrong side, the closing balance left out, and a row that belongs nowhere.
    r.sides[1] = [got('Balance b/d', 10000)];
    r.sides[0] = [got('Purchases Return A/c', 2000), got('Cash A/c', 15000), got('Purchases A/c', 40000), got('Sales A/c', 500)];
    const result = checkAnswer(SAMPLE_ACCOUNT, r);
    expect(result.correct).toBe(false);
    expect(result.format).toMatchObject({ right: 4, total: 6, extra: 1 });
    expect(result.format!.entered[0]).toEqual(['correct', 'correct', 'wrongSide', 'extraRow']);
    expect(result.format!.expected).toEqual([['ok', 'ok', 'missing'], ['ok', 'side'], [], ['ok']]);
    // The code keeps it all: a letter for each expected row, then the extra rows by their place among the labels.
    expect(result.mistakeCode).toBe(`rows:oomoso;${SAMPLE_ACCOUNT.labels.indexOf('Sales A/c')}`);
    expect(readFormatCode(SAMPLE_ACCOUNT, result.mistakeCode)).toEqual({ rows: ['ok', 'ok', 'missing', 'ok', 'side', 'ok'], extras: ['Sales A/c'] });
    expect(logicFor(SAMPLE_ACCOUNT).describeWrong(SAMPLE_ACCOUNT, result.mistakeCode!)).toBe('4 of 6 rows right. 1 row should not be there.');
    // The extra row cancels one right row, and no more.
    expect(result.parts).toEqual({ right: 3, total: 6 });
  });

  it('marks an account that is right but for an extra row as not right', () => {
    const r = account();
    r.sides[1].push(got('Bank A/c', 100));
    const result = checkAnswer(SAMPLE_ACCOUNT, r);
    expect(result).toMatchObject({ correct: false, parts: { right: 5, total: 6 }, mistakeCode: `rows:oooooo;${SAMPLE_ACCOUNT.labels.indexOf('Bank A/c')}` });
    expect(readFormatCode(SAMPLE_ACCOUNT, result.mistakeCode)?.extras).toEqual(['Bank A/c']);
  });

  it('marks a balance brought down above the totals as on the wrong side of the totals', () => {
    const r = account();
    r.sides[1].push(...r.below[1]);
    r.below[1] = [];
    const result = checkAnswer(SAMPLE_ACCOUNT, r);
    expect(result.format!.expected[3]).toEqual(['place']);
    expect(result.mistakeCode).toBe('rows:ooooop');
  });

  it('reads only its own codes', () => {
    expect(readFormatCode(SAMPLE_ACCOUNT, undefined)).toBeNull();
    expect(readFormatCode(SAMPLE_ACCOUNT, 'set:ok,ok')).toBeNull();
    expect(readFormatCode(SAMPLE_ACCOUNT, 'rows:ooo')).toBeNull();
    expect(readFormatCode(SAMPLE_ACCOUNT, 'rows:ooooox')).toBeNull();
    expect(readFormatCode(SAMPLE_ACCOUNT, 'rows:oooooo;99')).toBeNull();
    expect(readFormatCode(SAMPLE_ACCOUNT, 'rows:mmmmmm')).toEqual({ rows: Array(6).fill('missing'), extras: [] });
    expect(logicFor(SAMPLE_ACCOUNT).describeWrong(SAMPLE_ACCOUNT, 'wrongAmount')).toBeUndefined();
    expect(logicFor(SAMPLE_ACCOUNT).describeWrong(SAMPLE_ACCOUNT, 'rows:mmmmmm')).toBe('0 of 6 rows right.');
  });

  it('gives the end-to-end tests the rows to type, and no right answer in words', () => {
    expect(logicFor(SAMPLE_ACCOUNT).correctAnswer(SAMPLE_ACCOUNT)).toBeNull();
    const expected = logicFor(SAMPLE_ACCOUNT).e2eExpected(SAMPLE_ACCOUNT) as { sides: EnteredRow[][]; below: EnteredRow[][] };
    expect(JSON.parse(JSON.stringify(expected))).toEqual(expected);
    expect(expected.sides[0][2]).toEqual({ label: 'Balance c/d', amounts: [3300000] });
    expect(expected.below).toEqual([[], [{ label: 'Balance b/d', amounts: [3300000] }]]);
  });
});

describe('checking an account with a row that is as right under other wording', () => {
  const suspense = () => structuredClone(rightFormat(SAMPLE_SUSPENSE)) as AccountResponse;
  /** The answer with the row the account opens with entered as "Balance b/d". */
  const otherWording = () => {
    const r = suspense();
    r.sides[0][0] = got('Balance b/d', 5000);
    return r;
  };

  it('is right under the label and under the other wording, and the marks are all there', () => {
    expect(checkAnswer(SAMPLE_SUSPENSE, suspense())).toMatchObject({ correct: true, parts: { right: 5, total: 5 } });
    const result = checkAnswer(SAMPLE_SUSPENSE, otherWording());
    expect(result).toMatchObject({ correct: true, parts: { right: 5, total: 5 }, format: { right: 5, total: 5, extra: 0 } });
    expect(result.mistakeCode).toBeUndefined();
    expect(result.format!.entered[0]).toEqual(['correct', 'correct']);
    expect(caseMarks(4, result.parts!.right, result.parts!.total)).toBe(4);
    expect(caseMarks(6, result.parts!.right, result.parts!.total)).toBe(6);
  });

  it('still counts the row once, shows the label in the solution and types the label in the tests', () => {
    expect(expectedRows(SAMPLE_SUSPENSE).map((e) => e.row.label)).toEqual(['Difference in trial balance', 'Sales A/c', 'Mohan A/c', 'Balance c/d', 'Balance b/d']);
    expect(logicFor(SAMPLE_SUSPENSE).parts!(SAMPLE_SUSPENSE)).toEqual({ count: 5, name: 'rows' });
    const expected = logicFor(SAMPLE_SUSPENSE).e2eExpected(SAMPLE_SUSPENSE) as { sides: EnteredRow[][] };
    expect(expected.sides[0][0]).toEqual({ label: 'Difference in trial balance', amounts: [500000] });
  });

  it('marks the other wording wrong where the label would be wrong: another amount, the other side, below the totals', () => {
    const amount = otherWording();
    amount.sides[0][0] = got('Balance b/d', 500);
    expect(checkAnswer(SAMPLE_SUSPENSE, amount)).toMatchObject({ correct: false, mistakeCode: 'rows:aoooo', parts: { right: 4, total: 5 } });
    const side = otherWording();
    side.sides[1].push(...side.sides[0].splice(0, 1));
    expect(checkAnswer(SAMPLE_SUSPENSE, side)).toMatchObject({ correct: false, mistakeCode: 'rows:soooo' });
    // Both rows called "Balance b/d" entered below the totals: the one that belongs there is right, the other is misplaced.
    const below = otherWording();
    below.below[0].push(...below.sides[0].splice(0, 1));
    const result = checkAnswer(SAMPLE_SUSPENSE, below);
    expect(result).toMatchObject({ correct: false, mistakeCode: 'rows:poooo', parts: { right: 4, total: 5 } });
    expect(result.format!.entered[2]).toEqual(['correct', 'wrongPlace']);
    expect(logicFor(SAMPLE_SUSPENSE).describeWrong(SAMPLE_SUSPENSE, result.mistakeCode!)).toBe('4 of 5 rows right.');
  });

  it('takes a mark away for a balance brought down twice, as for any other row that should not be there', () => {
    const r = otherWording();
    r.below[0].push(got('Balance b/d', 900));
    const result = checkAnswer(SAMPLE_SUSPENSE, r);
    expect(result).toMatchObject({ correct: false, parts: { right: 4, total: 5 }, format: { right: 5, extra: 1 } });
    expect(readFormatCode(SAMPLE_SUSPENSE, result.mistakeCode)?.extras).toEqual(['Balance b/d']);
  });
});

describe('checking a statement', () => {
  it('is right when every balance is in its column', () => {
    expect(checkAnswer(SAMPLE_STATEMENT, statement())).toMatchObject({ correct: true, parts: { right: 5, total: 5 } });
  });

  it('tells an amount in the wrong column, a wrong amount and a row left out', () => {
    const r = statement();
    r.rows = [got('Cash in hand', 30000, 0), got('Drawings', 0, 5000), got('Rent paid', 6000, 0), got('Capital', 0, 90000)];
    const result = checkAnswer(SAMPLE_STATEMENT, r);
    expect(result.format!.entered[0]).toEqual(['correct', 'wrongColumn', 'wrongAmount', 'correct']);
    expect(result.mistakeCode).toBe('rows:ocaom');
    expect(result.parts).toEqual({ right: 2, total: 5 });
    expect(logicFor(SAMPLE_STATEMENT).describeWrong(SAMPLE_STATEMENT, result.mistakeCode!)).toBe('2 of 5 rows right.');
  });

  it('counts the final figure as one more row: right, wrong or not entered', () => {
    expect(expectedRows(SAMPLE_BRS).at(-1)).toEqual({ row: { label: 'Balance as per Pass Book', amounts: [2200000] }, final: true });
    expect(logicFor(SAMPLE_BRS).parts!(SAMPLE_BRS).count).toBe(4);
    expect(checkAnswer(SAMPLE_BRS, statement(SAMPLE_BRS))).toMatchObject({ correct: true, parts: { right: 4, total: 4 }, format: { final: 'ok' } });
    const wrong = checkAnswer(SAMPLE_BRS, { ...statement(SAMPLE_BRS), final: 3000000 });
    expect(wrong).toMatchObject({ correct: false, mistakeCode: 'rows:oooa', parts: { right: 3, total: 4 }, format: { final: 'amount' } });
    const none = checkAnswer(SAMPLE_BRS, { ...statement(SAMPLE_BRS), final: null });
    expect(none).toMatchObject({ correct: false, mistakeCode: 'rows:ooom', format: { final: 'missing' } });
    expect(readFormatCode(SAMPLE_BRS, 'rows:ooom')).toEqual({ rows: ['ok', 'ok', 'ok', 'missing'], extras: [] });
  });
});

describe('the marks of a format', () => {
  it('counts the right rows less the extra ones, never below none', () => {
    expect(rowsCounted(9, 0)).toBe(9);
    expect(rowsCounted(9, 2)).toBe(7);
    expect(rowsCounted(1, 3)).toBe(0);
  });

  it('shares the marks among the expected rows, to the nearest half mark', () => {
    // 4 marks, 11 rows: 9 right is 3.27, so 3.5; with one extra row 8 count, 2.91, so 3.
    expect(caseMarks(4, rowsCounted(9, 0), 11)).toBe(3.5);
    expect(caseMarks(4, rowsCounted(9, 1), 11)).toBe(3);
    expect(caseMarks(6, rowsCounted(11, 0), 11)).toBe(6);
    expect(caseMarks(6, rowsCounted(11, 1), 11)).toBe(5.5);
    expect(caseMarks(6, rowsCounted(0, 4), 11)).toBe(0);
  });

  it('words the score and the extra rows', () => {
    expect(formatScoreText(9, 11)).toBe('9 of 11 rows right');
    expect(extraRowsText(0)).toBeNull();
    expect(extraRowsText(1)).toBe('1 row should not be there.');
    expect(extraRowsText(3)).toBe('3 rows should not be there.');
  });
});
