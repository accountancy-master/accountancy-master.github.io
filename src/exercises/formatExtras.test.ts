import { describe, expect, it } from 'vitest';
import { validatePack } from '@/content/validate';
import { formatSample } from '@/content/report';
import type { EnteredRow } from '@/engine/formats';
import { caseMarks } from '@/learning/mockPaper';
import { asDraft, draftFilled, draftResponse, readDraft, type Draft } from '@/play/drafts';
import { accountDisagreement, draftList, listName, periodAgreement, readAccount, readStatement, startAccount, withDraftList } from '@/play/formatRows';
import { SAMPLE_ACCOUNT, SAMPLE_BOOK, SAMPLE_BRS, SAMPLE_BRS_CHOICE, SAMPLE_PERIODS, rightFormat, rightFormatDraft } from '@/testing/sampleFormats';
import { checkAnswer } from './checkers';
import { accountLists, expectedRows, formatLists, logicFor, periodCount, periodTitle, readFormatCode, type Response } from './logic';

type AccountResponse = Extract<Response, { type: 'account' }>;
type StatementResponse = Extract<Response, { type: 'statement' }>;
const got = (label: string, ...rupees: number[]): EnteredRow => ({ label, amounts: rupees.map((r) => r * 100) });
const periods = () => structuredClone(rightFormat(SAMPLE_PERIODS)) as AccountResponse;
const periodsDraft = () => structuredClone(rightFormatDraft(SAMPLE_PERIODS)) as Extract<Draft, { type: 'account' }>;

describe('an account kept over several periods', () => {
  it('lists its rows period by period, then below the last totals', () => {
    expect(periodCount(SAMPLE_ACCOUNT)).toBe(1);
    expect(periodCount(SAMPLE_PERIODS)).toBe(3);
    expect(periodTitle(SAMPLE_PERIODS, 1)).toBe('Year ended 31 March 2025');
    expect(periodTitle(SAMPLE_ACCOUNT, 0)).toBe('Period 1');
    expect(accountLists(SAMPLE_ACCOUNT)).toEqual([{ side: 0, period: 0 }, { side: 1, period: 0 }, { side: 0, below: true }, { side: 1, below: true }]);
    expect(accountLists(SAMPLE_PERIODS).map((l) => (l.below ? `below ${l.side}` : `${l.period}.${l.side}`))).toEqual(['0.0', '0.1', '1.0', '1.1', '2.0', '2.1', 'below 0', 'below 1']);
    expect(formatLists(SAMPLE_PERIODS).map((l) => l.length)).toEqual([1, 2, 1, 2, 2, 2, 1, 0]);
    expect(expectedRows(SAMPLE_PERIODS)).toHaveLength(11);
    expect(expectedRows(SAMPLE_PERIODS)[3]).toMatchObject({ row: { label: 'Balance b/d' }, side: 0, period: 1 });
    expect(expectedRows(SAMPLE_PERIODS).at(-1)).toEqual({ row: SAMPLE_PERIODS.sides[0].below[0], side: 0, below: true });
    expect(logicFor(SAMPLE_PERIODS).parts!(SAMPLE_PERIODS)).toEqual({ count: 11, name: 'rows' });
  });

  it('is right when every period has its rows: the same row may stand in two periods', () => {
    const result = checkAnswer(SAMPLE_PERIODS, periods());
    expect(result).toMatchObject({ correct: true, parts: { right: 11, total: 11 } });
    // The depreciation of the first two years is the same particulars and the same amount.
    expect(SAMPLE_PERIODS.sides[1].rows[0].amounts).toEqual(SAMPLE_PERIODS.later![0][1][0].amounts);
  });

  it('matches rows within their period: a row in the wrong period is on the wrong side of the totals', () => {
    const r = periods();
    // The third year's purchase entered in the second year; the second year's balance b/d left out.
    r.later![0][0] = [got('Bank A/c', 50000)];
    r.later![1][0] = [got('Balance b/d', 80000)];
    const result = checkAnswer(SAMPLE_PERIODS, r);
    expect(result.format!.entered[2]).toEqual(['wrongPlace']);
    expect(result.format!.expected[2]).toEqual(['missing']);
    expect(result.format!.expected[4]).toEqual(['ok', 'place']);
    expect(result).toMatchObject({ correct: false, parts: { right: 9, total: 11 }, mistakeCode: 'rows:ooomooopooo' });
    expect(readFormatCode(SAMPLE_PERIODS, result.mistakeCode)!.rows.filter((v) => v !== 'ok')).toEqual(['missing', 'place']);
    // A later period that was not entered at all is so many rows missing.
    const short = periods();
    delete short.later;
    expect(checkAnswer(SAMPLE_PERIODS, short)).toMatchObject({ correct: false, parts: { right: 4, total: 11 } });
  });

  it('shares its marks among the rows of all its periods', () => {
    const r = periods();
    r.later![1][1].pop();
    const { parts } = checkAnswer(SAMPLE_PERIODS, r);
    expect(parts).toEqual({ right: 10, total: 11 });
    expect(caseMarks(6, parts!.right, parts!.total)).toBe(5.5);
  });

  it('starts with two empty rows on each side of every period, and keeps what was entered', () => {
    const start = startAccount(undefined, 1, 3);
    expect(start.later).toHaveLength(2);
    expect(start.later!.flat().map((l) => l.length)).toEqual([2, 2, 2, 2]);
    const draft = periodsDraft();
    const rows = startAccount(draft, 1, 3);
    expect(rows.later).toEqual(draft.later);
    expect(draftList(rows, { side: 1, period: 2 })).toEqual(draft.later![1][1]);
    expect(draftList(rows, { side: 0, below: true })).toEqual(draft.below[0]);
    const changed = withDraftList(rows, { side: 0, period: 1 }, []);
    expect(changed.later![0]).toEqual([[], draft.later![0][1]]);
    expect(changed.later![1]).toBe(rows.later![1]);
    expect(withDraftList(rows, { side: 1, below: true }, draft.below[0]).below).toEqual([draft.below[0], draft.below[0]]);
    expect(readAccount(SAMPLE_PERIODS, rows).response).toEqual(rightFormat(SAMPLE_PERIODS));
  });

  it('names the period where a row cannot be read, and where the two sides do not agree', () => {
    expect(listName(SAMPLE_PERIODS, 0, false, 1)).toBe('Dr side, Year ended 31 March 2025');
    expect(listName(SAMPLE_PERIODS, 1, true)).toBe('Cr side, below the totals');
    const rows = startAccount(periodsDraft(), 1, 3);
    expect(accountDisagreement(SAMPLE_PERIODS, rows)).toBeNull();
    expect(periodAgreement(SAMPLE_PERIODS, rows, 2)).toEqual(['agree']);
    const off = withDraftList(rows, { side: 1, period: 1 }, [{ label: 'Depreciation A/c', amounts: [''] }]);
    expect(accountDisagreement(SAMPLE_PERIODS, off)).toBe('Year ended 31 March 2025: the two sides do not agree yet.');
    expect(periodAgreement(SAMPLE_PERIODS, off, 0)).toEqual(['agree']);
    expect(periodAgreement(SAMPLE_PERIODS, off, 1)).toEqual(['differ']);
    expect(readAccount(SAMPLE_PERIODS, off).problems).toEqual(['Cr side, Year ended 31 March 2025, row 1: enter an amount.']);
  });

  it('keeps its later periods in a draft, and gives the answer of the rows that can be read', () => {
    const draft = periodsDraft();
    expect(asDraft(SAMPLE_PERIODS, JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(asDraft(SAMPLE_PERIODS, { ...draft, later: [[[]]] })).toBeUndefined();
    expect(draftFilled({ type: 'account', sides: [[], []], below: [[], []], later: [[[{ label: 'Bank A/c', amounts: [''] }], []]] })).toBe(true);
    expect(draftResponse(SAMPLE_PERIODS, draft)).toEqual(rightFormat(SAMPLE_PERIODS));
    // Only a later period entered: still an answer.
    const read = readDraft(SAMPLE_PERIODS, { type: 'account', sides: [[], []], below: [[], []], later: draft.later });
    expect('response' in read && checkAnswer(SAMPLE_PERIODS, read.response).parts).toEqual({ right: 7, total: 11 });
  });

  it('is laid out for the reviewer period by period, and validated period by period', () => {
    const lines = formatSample(SAMPLE_PERIODS);
    expect(lines.filter((l) => l.startsWith('  Year ended'))).toEqual(['  Year ended 31 March 2024', '  Year ended 31 March 2025', '  Year ended 31 March 2026']);
    expect(lines.filter((l) => l.includes('By Depreciation A/c  ₹10,000'))).toHaveLength(2);
    expect(lines).toContain('   (the place for a balance brought down is offered)');
    const pack = (q: typeof SAMPLE_PERIODS) => ({ topicId: 'depreciation', concepts: [{ id: 'dep-formats', topicId: 'depreciation', title: 'x' }], cards: [], levels: [], questions: [q] });
    const mine = (errors: string[]) => errors.filter((e) => e.startsWith('question '));
    expect(mine(validatePack(pack(SAMPLE_PERIODS)))).toEqual([]);
    const lopsided = { ...SAMPLE_PERIODS, later: [[SAMPLE_PERIODS.later![0][0], []], SAMPLE_PERIODS.later![1]] as typeof SAMPLE_PERIODS.later };
    expect(mine(validatePack(pack(lopsided)))).toEqual(['question sample-periods: the totals do not agree']);
  });
});

describe('a statement that leaves the name of its final figure to the student', () => {
  const answer = (final: number | null, finalLabel?: string): StatementResponse => ({ ...(rightFormat(SAMPLE_BRS_CHOICE) as StatementResponse), final, finalLabel });

  it('is right only with the right name and the right amount', () => {
    expect(rightFormat(SAMPLE_BRS_CHOICE)).toMatchObject({ final: 2200000, finalLabel: 'Balance as per Pass Book' });
    expect(checkAnswer(SAMPLE_BRS_CHOICE, answer(2200000, 'Balance as per Pass Book'))).toMatchObject({ correct: true, format: { final: 'ok' } });
    // The right amount called an overdraft is not the right ending.
    const wrongName = checkAnswer(SAMPLE_BRS_CHOICE, answer(2200000, 'Overdraft as per Pass Book'));
    expect(wrongName).toMatchObject({ correct: false, mistakeCode: 'rows:oool', format: { final: 'label' }, parts: { right: 3, total: 4 } });
    expect(readFormatCode(SAMPLE_BRS_CHOICE, 'rows:oool')!.rows.at(-1)).toBe('label');
    expect(checkAnswer(SAMPLE_BRS_CHOICE, answer(2200000))).toMatchObject({ format: { final: 'label' } });
    expect(checkAnswer(SAMPLE_BRS_CHOICE, answer(100, 'Balance as per Pass Book'))).toMatchObject({ format: { final: 'amount' } });
    expect(checkAnswer(SAMPLE_BRS_CHOICE, answer(null))).toMatchObject({ format: { final: 'missing' } });
    // A statement that names its final figure itself takes no notice of a name.
    expect(checkAnswer(SAMPLE_BRS, { ...(rightFormat(SAMPLE_BRS) as StatementResponse), finalLabel: 'Anything' }).correct).toBe(true);
    expect(logicFor(SAMPLE_BRS_CHOICE).e2eExpected(SAMPLE_BRS_CHOICE)).toMatchObject({ final: 2200000, finalLabel: 'Balance as per Pass Book' });
    expect(logicFor(SAMPLE_BRS).e2eExpected(SAMPLE_BRS)).not.toHaveProperty('finalLabel');
  });

  it('is read with its name: a final figure that is begun needs both the name and the amount', () => {
    const draft = rightFormatDraft(SAMPLE_BRS_CHOICE);
    if (draft.type !== 'statement') throw new Error('not a statement');
    expect(draft.finalLabel).toBe('Balance as per Pass Book');
    expect(readStatement(SAMPLE_BRS_CHOICE, draft.rows, draft.final, draft.finalLabel)).toMatchObject({ problems: [], response: rightFormat(SAMPLE_BRS_CHOICE) });
    expect(readStatement(SAMPLE_BRS_CHOICE, draft.rows, '22000').problems).toEqual(['The final figure: choose what it is.']);
    expect(readStatement(SAMPLE_BRS_CHOICE, draft.rows, '', 'Overdraft as per Pass Book').problems).toEqual(['Overdraft as per Pass Book: enter an amount.']);
    expect(readStatement(SAMPLE_BRS_CHOICE, draft.rows, 'x', 'Overdraft as per Pass Book').problems).toEqual(['Overdraft as per Pass Book: enter a valid amount.']);
    // A name that is not on offer (an old draft) is no name.
    expect(readStatement(SAMPLE_BRS_CHOICE, [], '', 'Something else')).toMatchObject({ empty: true, response: { final: null } });
    expect(readStatement(SAMPLE_BRS_CHOICE, [], '', 'Overdraft as per Pass Book').empty).toBe(false);
    expect(asDraft(SAMPLE_BRS_CHOICE, JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(asDraft(SAMPLE_BRS_CHOICE, { ...draft, finalLabel: 5 })).toBeUndefined();
    expect(draftFilled({ type: 'statement', rows: [], final: '', finalLabel: 'Overdraft as per Pass Book' })).toBe(true);
    expect(draftResponse(SAMPLE_BRS_CHOICE, draft)).toEqual(rightFormat(SAMPLE_BRS_CHOICE));
    expect(formatSample(SAMPLE_BRS_CHOICE)).toContain('     Balance as per Pass Book  ₹22,000   (to be chosen from: Balance as per Pass Book; Overdraft as per Pass Book)');
  });
});

describe('a statement with four amount columns', () => {
  it('is checked column by column, and an amount in the wrong column is told as such', () => {
    const right = rightFormat(SAMPLE_BOOK) as StatementResponse;
    expect(checkAnswer(SAMPLE_BOOK, right)).toMatchObject({ correct: true, parts: { right: 3, total: 3 } });
    const rows = structuredClone(right.rows);
    // CGST and SGST of the second invoice are equal, so swapping them changes nothing; its value and total swapped is a wrong column.
    rows[1].amounts = [rows[1].amounts[3], rows[1].amounts[1], rows[1].amounts[2], rows[1].amounts[0]];
    rows[2].amounts = [rows[2].amounts[0], 0, 0, rows[2].amounts[3]];
    const result = checkAnswer(SAMPLE_BOOK, { ...right, rows });
    expect(result.format!.entered[0]).toEqual(['correct', 'wrongColumn', 'wrongAmount']);
    expect(result.parts).toEqual({ right: 1, total: 3 });
    const draft = rightFormatDraft(SAMPLE_BOOK);
    expect(draftResponse(SAMPLE_BOOK, draft)).toEqual(right);
    expect(formatSample(SAMPLE_BOOK)).toContain('     Total  ₹70,000 | ₹2,400 | ₹2,400 | ₹74,800');
  });
});
