import { describe, expect, it } from 'vitest';
import { judge } from '@/components/simulator/labs/kit/answers';
import { booksOf, goodsTotals, recordsOf } from './model';
import { askRng, boeAsk, BOE_ASK_KINDS } from './tryit';
import { walkOf } from './walk';

describe('the quick questions of the books lab', () => {
  it('make sound questions of every kind from many seeds', () => {
    for (const kind of BOE_ASK_KINDS) {
      for (let n = 0; n < 40; n++) {
        const ask = boeAsk(kind, askRng(3, kind, n));
        const walk = walkOf(ask.month, recordsOf(ask.month));
        expect(ask.reveal, `${kind} ${n}`).toBeGreaterThan(ask.shown - 1);
        expect(ask.reveal).toBeLessThanOrEqual(walk.length);
        expect(ask.prompt.length).toBeGreaterThan(20);
        const a = ask.answer;
        if (a.type === 'choice') {
          const ids = a.options.map((o) => o.id);
          expect(new Set(ids).size, `${kind} ${n}: ${ids.join(',')}`).toBe(ids.length);
          expect(ids).toContain(a.correct);
          expect(a.options.length).toBeGreaterThanOrEqual(3);
          for (const o of a.options) if (o.id !== a.correct) expect(o.why, `${kind} ${n} ${o.id}`).toBeTruthy();
          expect(judge(a, { choice: a.correct }).right).toBe(true);
        } else {
          expect(a.value).toBeGreaterThan(0);
          expect(a.mistakes.every((x) => x.value !== a.value)).toBe(true);
          expect(judge(a, { figure: a.value, tag: a.tag?.correct ?? null }).right).toBe(true);
        }
      }
    }
  });

  it('ask the same question for the same seed', () => {
    expect(boeAsk('posting', askRng(7, 'posting', 2)).prompt).toBe(boeAsk('posting', askRng(7, 'posting', 2)).prompt);
  });

  it('give the closing balance of the column as the Cash Book has it', () => {
    for (let n = 0; n < 20; n++) {
      const ask = boeAsk('cash-balance', askRng(11, 'cash-balance', n));
      const v = booksOf(ask.month, recordsOf(ask.month)).cash.view;
      if (ask.answer.type !== 'number') throw new Error('a figure');
      const bank = ask.prompt.includes('in the bank column on');
      const bal = bank ? v.bank : v.cash;
      expect(ask.answer.value).toBe(bal!.amount);
      if (bank) expect(ask.answer.tag!.correct).toBe(bal!.side === 'Dr' ? 'dr' : 'od');
    }
  });

  it('post the taxable value column of a goods book, not its total', () => {
    for (let n = 0; n < 20; n++) {
      const ask = boeAsk('book-total', askRng(5, 'book-total', n));
      const b = booksOf(ask.month, recordsOf(ask.month));
      if (ask.answer.type !== 'number' || ask.book === 'cash' || ask.book === 'petty' || ask.book === 'journal') throw new Error('a goods book');
      expect(ask.answer.value).toBe(goodsTotals(b[ask.book]).taxable);
    }
  });
});
