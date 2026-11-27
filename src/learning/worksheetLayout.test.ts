import { describe, expect, it } from 'vitest';
import '@/content/registry';
import type { AccountQuestion, JournalSetQuestion, NumericQuestion, Question, RatioQuestion, StatementQuestion } from '@/content/types';
import { kindOf, showFigure } from '@/engine/formats';
import { TEMPLATES, generateQuestion } from '@/generators';
import {
  MIN_JOURNAL_ROWS,
  answerBlank,
  choiceAnswer,
  figureAnswer,
  isDated,
  journalRows,
  keyJournalLines,
  ledgerLayout,
  setRows,
  shortAnswer,
  sideTitle,
  statementLayout,
  statementRowCount,
  workingOf,
} from './worksheetLayout';

const all = <T extends Question>(kind: string, seeds = [1, 2]): T[] => TEMPLATES.filter((t) => t.kind === kind).flatMap((t) => seeds.map((s) => generateQuestion(t.id, s) as T));

describe('a journal on paper', () => {
  it('has a row for every line and the narration, two to spare, and never fewer than the least', () => {
    expect(journalRows(2)).toBe(MIN_JOURNAL_ROWS);
    expect(journalRows(3)).toBe(MIN_JOURNAL_ROWS);
    expect(journalRows(5)).toBe(8);
    for (const lines of [1, 2, 3, 4, 5, 6, 7, 8]) expect(journalRows(lines)).toBeGreaterThanOrEqual(lines + 1);
  });

  it('gives a set a row for every line and narration of every entry, and two to spare', () => {
    for (const q of all<JournalSetQuestion>('journal_set', [1])) {
      const needed = q.entries.reduce((n, e) => n + e.expected.length + 1, 0);
      expect(setRows(q)).toBe(needed + 2);
    }
  });

  it('writes an entry in the key with the debits first, "Dr." after them and "To" before the credits', () => {
    const lines = keyJournalLines(
      [
        { accountId: 'sales', side: 'Cr', amount: 500000 },
        { accountId: 'cash', side: 'Dr', amount: 500000 },
      ],
      '5 April',
    );
    expect(lines).toEqual([
      { date: '5 April', particulars: 'Cash A/c ... Dr.', side: 'Dr', debit: '5,000', credit: '' },
      { date: '', particulars: 'To Sales A/c', side: 'Cr', debit: '', credit: '5,000' },
    ]);
  });
});

describe('a ledger account on paper', () => {
  const accounts = all<AccountQuestion>('account', [1]);

  it('heads its sides Dr. and Cr. with Date, Particulars, J.F. and the amount columns', () => {
    const plain = accounts.find((q) => q.columns.length === 1 && q.sides[0].prefix && !q.later)!;
    const layout = ledgerLayout(plain);
    expect(layout.sideTitles).toEqual(['Dr.', 'Cr.']);
    expect(layout.dated).toBe(true);
    expect(layout.heads).toEqual(['Date', 'Particulars', 'J.F.', ...plain.columns]);
    expect(layout.periods).toEqual([{ title: null, rows: Math.max(plain.sides[0].rows.length, plain.sides[1].rows.length) + 1 }]);
  });

  it("keeps the partners' columns of an account in columns, without a date", () => {
    const capital = accounts.find((q) => q.columns.length > 2)!;
    const layout = ledgerLayout(capital);
    expect(layout.heads).toEqual(['Particulars', ...capital.columns]);
    expect(layout.columns).toHaveLength(capital.columns.length);
    expect(layout.dated).toBe(false);
  });

  it('heads a Balance Sheet by its sides, with no date', () => {
    const sheet = accounts.find((q) => q.sides[0].prefix === undefined)!;
    expect(ledgerLayout(sheet).sideTitles).toEqual([sheet.sides[0].title, sheet.sides[1].title]);
    expect(isDated(sheet)).toBe(false);
  });

  it('rules every period of an account kept over several, and room for the balance brought down', () => {
    const several = accounts.find((q) => (q.later?.length ?? 0) > 0)!;
    const layout = ledgerLayout(several);
    expect(layout.periods.map((p) => p.title)).toEqual(several.periodTitles);
    expect(layout.periods).toHaveLength(1 + several.later!.length);
    for (const q of accounts) {
      const l = ledgerLayout(q);
      const longest = [[q.sides[0].rows, q.sides[1].rows], ...(q.later ?? [])].map(([a, b]) => Math.max(a.length, b.length));
      expect(l.periods.map((p) => p.rows)).toEqual(longest.map((n) => n + 1));
      const below = Math.max(q.sides[0].below.length, q.sides[1].below.length);
      expect(l.below).toBe(below || (q.continued ? 1 : 0));
    }
    expect(sideTitle('Liabilities')).toBe('Liabilities');
  });
});

describe('a statement on paper', () => {
  const statements = all<StatementQuestion>('statement', [1, 2]);

  it('leaves every row blank, with one to spare in each part, when it gives no figures', () => {
    for (const q of statements.filter((s) => !s.givenColumns)) {
      const layout = statementLayout(q);
      const parts = new Set((q.lines ?? []).map((l) => l.at).filter((at) => at > 0 && at < q.rows.length)).size + 1;
      expect(statementRowCount(layout), q.id).toBe(q.rows.length + parts);
      expect(layout.lines.filter((l) => l.type === 'row').every((l) => l.type === 'row' && l.label === null && l.cells.every((c) => c === null))).toBe(true);
      expect(layout.heads).toEqual([q.heading, ...(q.noteHeading ? [q.noteHeading] : []), ...q.columns]);
      const headings = layout.lines.filter((l) => l.type === 'heading').map((l) => l.type === 'heading' && l.text);
      expect(headings).toEqual((q.lines ?? []).flatMap((l) => ('heading' in l ? [l.heading] : [])));
    }
  });

  it('prints the particulars and the given figures of every row that prints any, as the question gives them', () => {
    const given = statements.filter((s) => s.givenColumns);
    expect(given.length).toBeGreaterThan(0);
    for (const q of given) {
      const layout = statementLayout(q);
      const rows = layout.lines.filter((l) => l.type === 'row');
      expect(rows).toHaveLength(q.rows.length);
      q.rows.forEach((row, i) => {
        const line = rows[i];
        if (line.type !== 'row') throw new Error('not a row');
        q.columns.forEach((_, c) => {
          const prints = q.givenColumns![c] && row.given !== false;
          expect(line.cells[c], `${q.id} ${row.label} ${c}`).toBe(prints ? showFigure(row.amounts[c], kindOf(q.columnKinds, c)) : null);
        });
        expect(line.label).toBe(line.cells.some((c) => c !== null) ? row.label : null);
      });
    }
  });

  it('ends on a total, or on the figure it ends on, named or to be chosen', () => {
    for (const q of statements) {
      const layout = statementLayout(q);
      const last = layout.lines[layout.lines.length - 1];
      if (q.final) expect(last).toEqual(q.final.options ? { type: 'final', label: null, options: q.final.options } : { type: 'final', label: q.final.label });
      const subtotals = (q.lines ?? []).filter((l) => 'subtotal' in l).length;
      expect(layout.lines.filter((l) => l.type === 'subtotal')).toHaveLength(subtotals);
      if (subtotals > 0) expect(layout.lines.some((l) => l.type === 'total')).toBe(false);
    }
  });
});

describe('answers of a figure, a choice or true or false', () => {
  const numeric = all<NumericQuestion | RatioQuestion>('numeric', [1]);

  it('gives the answer line its unit: ₹, %, times, or as many blanks as the ratio has terms', () => {
    const of = (unit: string) => numeric.find((q) => q.unit === unit)!;
    expect(answerBlank(of('rupees'))).toEqual({ before: '₹', after: '', terms: 1 });
    expect(answerBlank(of('percent'))).toEqual({ before: '', after: '%', terms: 1 });
    expect(answerBlank(of('times'))).toEqual({ before: '', after: 'times', terms: 1 });
    const ratio = of('ratio') as RatioQuestion;
    expect(answerBlank(ratio).terms).toBe(ratio.answer.length);
  });

  it('writes the answer as the board expects it', () => {
    expect(figureAnswer({ unit: 'rupees', answer: 1250000 })).toBe('₹12,500');
    expect(figureAnswer({ unit: 'percent', answer: 1250 })).toBe('12.5%');
    expect(figureAnswer({ unit: 'times', answer: 250 })).toBe('2.5 times');
    expect(figureAnswer({ unit: 'number', answer: 42 })).toBe('42');
    expect(figureAnswer({ unit: 'ratio', answer: [5, 3, 2] })).toBe('5 : 3 : 2');
    expect(choiceAnswer({ options: [{ id: 'a', text: 'Cash' }, { id: 'b', text: 'Bank' }], correct: 'b' })).toBe('(b) Bank');
    const mcq = all<Question>('mcq', [1])[0];
    expect(shortAnswer(mcq)).toMatch(/^\([a-d]\) /);
    for (const q of numeric) {
      expect(workingOf(q)).toEqual(q.working);
      expect(shortAnswer(q)).toBe(figureAnswer(q));
    }
  });
});
