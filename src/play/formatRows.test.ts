import { describe, expect, it } from 'vitest';
import { checkAnswer } from '@/exercises/checkers';
import { SAMPLE_ACCOUNT, SAMPLE_BOOK, SAMPLE_BRS, SAMPLE_BRS_CHOICE, SAMPLE_PERIODS, SAMPLE_STATEMENT, SAMPLE_SUSPENSE, rightFormat, rightFormatDraft, wrongFormatDraft } from '@/testing/sampleFormats';
import { asDraft, draftFilled, draftResponse, readDraft, responseDraft, type Draft } from './drafts';
import {
  accountDisagreement,
  agreement,
  checkFormat,
  emptyFormatRow,
  isBlankFormatRow,
  listName,
  readAccount,
  readList,
  readStatement,
  ruledOff,
  runningTotals,
  startAccount,
  startList,
  statementDisagreement,
  usesOtherWording,
  type AccountDraftRows,
  type FormatRowDraft,
} from './formatRows';

const r = (label: string, ...amounts: string[]): FormatRowDraft => ({ label, amounts });
const accountDraft = () => structuredClone(rightFormatDraft(SAMPLE_ACCOUNT)) as Extract<Draft, { type: 'account' }>;
const statementDraft = (q = SAMPLE_STATEMENT) => structuredClone(rightFormatDraft(q)) as Extract<Draft, { type: 'statement' }>;

describe('the rows of a format as they are typed', () => {
  it('starts an account with two empty rows on each side and none below the totals, or from what was entered', () => {
    const start = startAccount(undefined, 1);
    expect(start.sides.map((s) => s.length)).toEqual([2, 2]);
    expect(start.below).toEqual([[], []]);
    expect(start.sides[0].every(isBlankFormatRow)).toBe(true);
    expect(emptyFormatRow(2)).toEqual({ label: '', amounts: ['', ''] });
    const draft = accountDraft();
    expect(startAccount(draft, 1)).toEqual({ sides: draft.sides, below: draft.below, later: [] });
    // A stored row is fitted to the columns of the format.
    expect(startList([r('Cash A/c', '5')], 2)).toEqual([r('Cash A/c', '5', '')]);
    expect(startList([r('Cash A/c', '5', '6')], 1)).toEqual([r('Cash A/c', '5')]);
    expect(startList(undefined, 2, 3)).toHaveLength(3);
  });

  it('totals the amounts that can be read, column by column', () => {
    expect(runningTotals([r('a', '1,000', ''), r('', '', '250'), r('b', 'abc', '50.50')], 2)).toEqual([100000, 30050]);
    expect(runningTotals([], 1)).toEqual([0]);
  });

  it('says whether two totals agree without saying by how much they differ', () => {
    expect(agreement([0, 0], [0, 0])).toEqual(['empty', 'empty']);
    expect(agreement([500, 0], [500, 0])).toEqual(['agree', 'empty']);
    expect(agreement([500, 100], [500, 200])).toEqual(['agree', 'differ']);
    // The totals are ruled off only when something is entered and nothing differs.
    expect(ruledOff(['empty', 'empty'])).toBe(false);
    expect(ruledOff(['agree', 'empty'])).toBe(true);
    expect(ruledOff(['agree', 'differ'])).toBe(false);
  });

  it('reads a list: blank rows are skipped, and a row begun needs its particulars and an amount', () => {
    const read = readList([r('Cash A/c', '15,000'), r('', ''), r('', '500'), r('Rent A/c', ''), r('Sales A/c', 'lots'), r('Bank A/c', ' 2000 ')]);
    expect(read.rows).toEqual([
      { label: 'Cash A/c', amounts: [1500000] },
      { label: 'Bank A/c', amounts: [200000] },
    ]);
    expect(read.rowIndex).toEqual([0, 5]);
    expect(read.problems).toEqual(['row 3: choose the particulars.', 'row 4: enter an amount.', 'row 5: enter a valid amount.']);
    // With two columns one amount is enough, and the other column is 0.
    expect(readList([r('Capital', '', '900')]).rows).toEqual([{ label: 'Capital', amounts: [0, 90000] }]);
    expect(readList([r('Capital', '5', 'x')]).problems).toEqual(['row 1: enter a valid amount.']);
  });
});

describe('an account as it stands', () => {
  it('reads as the right answer when the right rows are typed', () => {
    const draft = accountDraft();
    const read = readAccount(SAMPLE_ACCOUNT, draft);
    expect(read.response).toEqual(rightFormat(SAMPLE_ACCOUNT));
    expect(read.rowIndex).toEqual([[0, 1, 2], [0, 1], [], [0]]);
    expect(read).toMatchObject({ problems: [], empty: false });
    expect(checkAnswer(SAMPLE_ACCOUNT, read.response).correct).toBe(true);
  });

  it('names the side and the row of what cannot be read', () => {
    expect(listName(SAMPLE_ACCOUNT, 0, false)).toBe('Dr side');
    expect(listName(SAMPLE_ACCOUNT, 1, true)).toBe('Cr side, below the totals');
    const draft: AccountDraftRows = { sides: [[r('Cash A/c', '')], [r('', '40000')]], below: [[], [r('Balance b/d', 'x')]] };
    expect(readAccount(SAMPLE_ACCOUNT, draft).problems).toEqual([
      'Dr side, row 1: enter an amount.',
      'Cr side, row 1: choose the particulars.',
      'Cr side, below the totals, row 1: enter a valid amount.',
    ]);
    expect(readAccount(SAMPLE_ACCOUNT, startAccount(undefined, 1)).empty).toBe(true);
  });

  it('is checked only when every row can be read, and after one warning when the sides do not agree', () => {
    const empty = startAccount(undefined, 1);
    expect(checkFormat(readAccount(SAMPLE_ACCOUNT, empty), accountDisagreement(SAMPLE_ACCOUNT, empty), false)).toEqual({ problem: 'Enter at least one row.' });
    const begun: AccountDraftRows = { ...empty, sides: [[r('Cash A/c', '')], empty.sides[1]] };
    expect(checkFormat(readAccount(SAMPLE_ACCOUNT, begun), accountDisagreement(SAMPLE_ACCOUNT, begun), true)).toEqual({ problem: 'Dr side, row 1: enter an amount.' });

    const short = accountDraft();
    short.sides[0].pop();
    expect(accountDisagreement(SAMPLE_ACCOUNT, short)).toBe('The two sides do not agree yet.');
    const read = readAccount(SAMPLE_ACCOUNT, short);
    expect(checkFormat(read, accountDisagreement(SAMPLE_ACCOUNT, short), false)).toEqual({ confirm: 'The two sides do not agree yet. Press Check again to check it as it is.' });
    expect(checkFormat(read, accountDisagreement(SAMPLE_ACCOUNT, short), true)).toEqual({ submit: read.response, rowIndex: read.rowIndex });

    const whole = accountDraft();
    expect(accountDisagreement(SAMPLE_ACCOUNT, whole)).toBeNull();
    expect(checkFormat(readAccount(SAMPLE_ACCOUNT, whole), null, false)).toMatchObject({ submit: rightFormat(SAMPLE_ACCOUNT) });
  });
});

describe('a row entered under other wording', () => {
  const lists = (draft: Draft) => (draft.type === 'account' ? [draft.sides[0], draft.sides[1], draft.below[0], draft.below[1]] : []);

  it('is told from the rows entered under the names the correct format shows, list by list', () => {
    const draft = structuredClone(rightFormatDraft(SAMPLE_SUSPENSE)) as Extract<Draft, { type: 'account' }>;
    // Under the labels of the solution, the balance brought down below the totals among them, and with rows left blank.
    expect(usesOtherWording(SAMPLE_SUSPENSE, lists(draft))).toBe(false);
    expect(usesOtherWording(SAMPLE_SUSPENSE, lists({ ...draft, sides: [[...draft.sides[0], r('', '')], draft.sides[1]] }))).toBe(false);
    // The row the account opens with as "Balance b/d": a name the solution shows only below the totals.
    draft.sides[0][0] = r('Balance b/d', '5000');
    expect(usesOtherWording(SAMPLE_SUSPENSE, lists(draft))).toBe(true);
    expect(checkAnswer(SAMPLE_SUSPENSE, draftResponse(SAMPLE_SUSPENSE, draft)!).correct).toBe(true);
    expect(usesOtherWording(SAMPLE_STATEMENT, [statementDraft().rows])).toBe(false);
  });
});

describe('a statement as it stands', () => {
  it('reads its rows and its final figure', () => {
    const draft = statementDraft(SAMPLE_BRS);
    const read = readStatement(SAMPLE_BRS, draft.rows, draft.final);
    expect(read.response).toEqual(rightFormat(SAMPLE_BRS));
    expect(read).toMatchObject({ problems: [], empty: false, rowIndex: [[0, 1, 2]] });
    expect(readStatement(SAMPLE_BRS, draft.rows, '').response.final).toBeNull();
    expect(readStatement(SAMPLE_BRS, [r('', '', '')], 'much')).toMatchObject({ problems: ['Balance as per Pass Book: enter a valid amount.'], empty: false, response: { final: null } });
    expect(readStatement(SAMPLE_BRS, [r('Bank charges', '', '')], '').problems).toEqual(['Row 1: enter an amount.']);
    // A statement without a final figure never reads one.
    expect(readStatement(SAMPLE_STATEMENT, statementDraft().rows, '500').response.final).toBeNull();
  });

  it('warns once when the two columns of a trial balance do not agree, and never for a statement that need not agree', () => {
    const draft = statementDraft();
    expect(statementDisagreement(SAMPLE_STATEMENT, draft.rows)).toBeNull();
    expect(statementDisagreement(SAMPLE_STATEMENT, draft.rows.slice(1))).toBe('The two columns do not agree yet.');
    expect(statementDisagreement(SAMPLE_BRS, statementDraft(SAMPLE_BRS).rows)).toBeNull();
  });
});

describe('drafts of formats', () => {
  it('are kept only in a shape that is known, for a question of their own type', () => {
    const draft = accountDraft();
    expect(asDraft(SAMPLE_ACCOUNT, JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(asDraft(SAMPLE_STATEMENT, draft)).toBeUndefined();
    expect(asDraft(SAMPLE_ACCOUNT, { type: 'account', sides: [[], []] })).toBeUndefined();
    expect(asDraft(SAMPLE_ACCOUNT, { type: 'account', sides: [[{ label: 'x', amounts: [5] }], []], below: [[], []] })).toBeUndefined();
    expect(asDraft(SAMPLE_ACCOUNT, { type: 'account', sides: [[], [], []], below: [[], []] })).toBeUndefined();
    const st = statementDraft();
    expect(asDraft(SAMPLE_STATEMENT, JSON.parse(JSON.stringify(st)))).toEqual(st);
    expect(asDraft(SAMPLE_STATEMENT, { type: 'statement', rows: st.rows })).toBeUndefined();
  });

  it('are made again from the answer an attempt kept, and read as that answer', () => {
    // Every kind of format: one and two columns, several periods, rows below the totals, four columns, a final figure
    // with and without a name of its own. What was typed is not kept, so the amounts come back as amounts are written.
    for (const q of [SAMPLE_ACCOUNT, SAMPLE_PERIODS, SAMPLE_SUSPENSE, SAMPLE_STATEMENT, SAMPLE_BRS, SAMPLE_BRS_CHOICE, SAMPLE_BOOK]) {
      const answer = rightFormat(q);
      if (answer.type !== 'account' && answer.type !== 'statement') throw new Error('not a format');
      const draft = responseDraft(answer);
      expect(asDraft(q, JSON.parse(JSON.stringify(draft))), q.id).toEqual(draft);
      expect(draftResponse(q, draft), q.id).toEqual(answer);
    }
    expect(responseDraft(rightFormat(SAMPLE_ACCOUNT) as Extract<ReturnType<typeof rightFormat>, { type: 'account' }>)).toMatchObject({
      sides: [[r('Purchases Return A/c', '2,000'), r('Cash A/c', '15,000'), r('Balance c/d', '33,000')], [r('Balance b/d', '10,000'), r('Purchases A/c', '40,000')]],
      below: [[], [r('Balance b/d', '33,000')]],
    });
    // A column left blank stays blank, and so does a final figure that was not entered.
    const wrong = { type: 'statement' as const, rows: [{ label: 'Drawings', amounts: [0, 500000] }], final: null };
    expect(responseDraft(wrong)).toEqual({ type: 'statement', rows: [r('Drawings', '', '5,000')], final: '' });
    expect(draftResponse(SAMPLE_STATEMENT, responseDraft(wrong))).toEqual(wrong);
    expect(responseDraft({ ...wrong, final: 2200000, finalLabel: 'Overdraft as per Pass Book' })).toMatchObject({ final: '22,000', finalLabel: 'Overdraft as per Pass Book' });
  });

  it('count as filled once a row is begun or a final figure typed', () => {
    expect(draftFilled({ type: 'account', ...startAccount(undefined, 1) })).toBe(false);
    expect(draftFilled({ type: 'account', sides: [[], []], below: [[], [r('Balance b/d', '')]] })).toBe(true);
    expect(draftFilled({ type: 'statement', rows: [r('', '', '')], final: ' ' })).toBe(false);
    expect(draftFilled({ type: 'statement', rows: [], final: '5' })).toBe(true);
  });

  it('give the answer of the rows that can be read, with the problem of a row that cannot', () => {
    expect(draftResponse(SAMPLE_ACCOUNT, accountDraft())).toEqual(rightFormat(SAMPLE_ACCOUNT));
    expect(readDraft(SAMPLE_ACCOUNT, { type: 'account', ...startAccount(undefined, 1) })).toEqual({ empty: true });
    // One row begun and not complete, the rest readable: the rest is marked, and the problem is told.
    const partly = accountDraft();
    partly.sides[0][2] = r('Balance c/d', '');
    const read = readDraft(SAMPLE_ACCOUNT, partly);
    expect(read).toMatchObject({ problem: 'Dr side, row 3: enter an amount.' });
    expect('response' in read && read.response.type === 'account' && read.response.sides[0]).toHaveLength(2);
    // Nothing readable at all is a problem, not an answer.
    expect(readDraft(SAMPLE_ACCOUNT, { type: 'account', sides: [[r('Cash A/c', '')], []], below: [[], []] })).toEqual({ problem: 'Dr side, row 1: enter an amount.' });
    expect(draftResponse(SAMPLE_STATEMENT, statementDraft())).toEqual(rightFormat(SAMPLE_STATEMENT));
    expect(readDraft(SAMPLE_BRS, { type: 'statement', rows: [], final: '22,000' })).toEqual({ response: { type: 'statement', rows: [], final: 2200000 } });
    expect(readDraft(SAMPLE_BRS, { type: 'statement', rows: [], final: 'x' })).toEqual({ problem: 'Balance as per Pass Book: enter a valid amount.' });
    // A draft of another type of question is nothing.
    expect(readDraft(SAMPLE_STATEMENT, accountDraft())).toEqual({ empty: true });
  });

  it('have a wrong answer for tests that is complete and not right', () => {
    for (const q of [SAMPLE_ACCOUNT, SAMPLE_STATEMENT, SAMPLE_BRS]) {
      const response = draftResponse(q, wrongFormatDraft(q))!;
      expect(checkAnswer(q, response)).toMatchObject({ correct: false, parts: { right: q === SAMPLE_BRS ? 3 : q === SAMPLE_ACCOUNT ? 5 : 4 } });
    }
  });
});
