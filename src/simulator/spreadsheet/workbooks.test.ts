import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { chartData } from './chart';
import { isErr } from './evaluate';
import { computeSheet, numberIn, shownOf } from './sheet';
import { finished, freshFigures, playSheet, walkOf, WORKBOOKS, workbookOf, withFigures, type WorkbookId } from './workbooks';

/** The sheet of a workbook with every step done, worked out. */
const done = (id: WorkbookId) => {
  const cells = finished(workbookOf(id));
  return { cells, sheet: computeSheet(cells) };
};
const n = (id: WorkbookId, addr: string) => numberIn(done(id).sheet, addr);

describe('the ready workbooks, worked by hand', () => {
  it('bank reconciliation: 48,000 + 7,500 + 600 - 12,000 - 500 = 43,600 in the pass book', () => {
    expect(n('brs', 'B7')).toBe(56100);
    expect(n('brs', 'C7')).toBe(12500);
    expect(n('brs', 'B8')).toBe(43600);
    const { cells, sheet } = done('brs');
    expect(cells.C7.input).toBe('=SUM(C2:C6)');
    expect(shownOf(cells, sheet, 'B8')).toBe('₹43,600');
    expect(sheet.get('B9')!.value).toBe('Credit balance');
  });

  it('straight line: (1,60,000 - 10,000) ÷ 4 = 37,500 a year, down to the salvage value', () => {
    for (const r of [6, 7, 8, 9]) expect(n('sln', `B${r}`)).toBe(37500);
    expect([6, 7, 8, 9].map((r) => n('sln', `C${r}`))).toEqual([37500, 75000, 112500, 150000]);
    expect([6, 7, 8, 9].map((r) => n('sln', `D${r}`))).toEqual([122500, 85000, 47500, 10000]);
    const { cells } = done('sln');
    expect(cells.B9.input).toBe('=SLN($B$1,$B$2,$B$3)');
    expect(cells.C9.input).toBe('=SUM($B$6:B9)');
    expect(cells.D9.input).toBe('=$B$1-C9');
  });

  it('DB: a rate of 50% on the falling book value, 80,000, 40,000, 20,000, 10,000', () => {
    expect(n('db', 'B4')).toBe(0.5);
    expect([7, 8, 9, 10].map((r) => n('db', `B${r}`))).toEqual([160000, 80000, 40000, 20000]);
    expect([7, 8, 9, 10].map((r) => n('db', `C${r}`))).toEqual([80000, 40000, 20000, 10000]);
    expect([7, 8, 9, 10].map((r) => n('db', `D${r}`))).toEqual([80000, 40000, 20000, 10000]);
    const { cells, sheet } = done('db');
    expect(cells.C10.input).toBe('=DB($B$1,$B$2,$B$3,A10)');
    expect(cells.B10.input).toBe('=D9');
    expect(shownOf(cells, sheet, 'B4')).toBe('50%');
  });

  it('a rate in a cell: 25% on 4,00,000, then on 3,00,000 and 2,25,000', () => {
    expect([5, 6, 7].map((r) => n('wdv', `C${r}`))).toEqual([100000, 75000, 56250]);
    expect([5, 6, 7].map((r) => n('wdv', `D${r}`))).toEqual([300000, 225000, 168750]);
    expect(done('wdv').cells.C7.input).toBe('=B7*$B$2');
  });

  it('loan: 3,31,000 at 10% in 3 instalments of 1,33,100', () => {
    expect(n('loan', 'B4')).toBeCloseTo(133100, 6);
    const rows = [7, 8, 9].map((r) => ['B', 'C', 'D', 'E'].map((c) => Math.round(n('loan', `${c}${r}`) * 100) / 100));
    expect(rows).toEqual([
      [331000, 33100, 100000, 231000],
      [231000, 23100, 110000, 121000],
      [121000, 12100, 121000, 0],
    ]);
    expect(n('loan', 'C10')).toBeCloseTo(68300, 6);
    expect(n('loan', 'D10')).toBeCloseTo(331000, 6);
    const { cells, sheet } = done('loan');
    expect(shownOf(cells, sheet, 'E9')).toBe('₹0');
    expect(shownOf(cells, sheet, 'B4')).toBe('₹1,33,100');
  });

  it('ratios: current 2.25, quick 1.44, inventory turnover 3.82, gross profit 30%, net profit 10%, debt to equity 0.5', () => {
    // Quick: (3,60,000 - 1,20,000 - 10,000) ÷ 1,60,000 = 1.4375 → 1.44; turnover: 4,20,000 ÷ 1,10,000 = 3.818... → 3.82.
    // Debt to equity as Accounting Ratios defines it: (long-term borrowings 2,00,000 + long-term provisions 50,000) ÷ 5,00,000.
    expect([15, 16, 17, 18, 19, 20].map((r) => n('ratios', `B${r}`))).toEqual([2.25, 1.44, 3.82, 30, 10, 0.5]);
    expect(done('ratios').cells.B20.input).toBe('=ROUND((B11+B12)/B13,2)');
  });

  it('chart: shares 40, 15, 10, 20, 15 per cent and angles 144, 54, 36, 72, 54 degrees of ₹3,60,000', () => {
    expect(n('chart', 'B7')).toBe(360000);
    expect([2, 3, 4, 5, 6].map((r) => n('chart', `C${r}`))).toEqual([40, 15, 10, 20, 15]);
    expect([2, 3, 4, 5, 6].map((r) => n('chart', `D${r}`))).toEqual([144, 54, 36, 72, 54]);
    expect(n('chart', 'C7')).toBe(100);
    expect(n('chart', 'D7')).toBe(360);
    const { cells, sheet } = done('chart');
    const data = chartData(workbookOf('chart').chart!, cells, sheet);
    if (!data.ok) throw new Error(data.problem);
    expect(data.items.map((x) => [x.label, x.value, x.angle])).toEqual([
      ['Salaries', 144000, 144],
      ['Rent', 54000, 54],
      ['Electricity', 36000, 36],
      ['Advertisement', 72000, 72],
      ['Repairs', 54000, 54],
    ]);
  });
});

describe('the walk-throughs', () => {
  it('tell every step with the figure the sheet shows, and no step leaves an error', () => {
    for (const wb of WORKBOOKS) {
      const frames = walkOf(wb);
      expect(frames.length, wb.id).toBe(wb.steps.length);
      for (const f of frames) {
        expect(f.text, `${wb.id}: ${f.title}`).not.toMatch(/\{[A-Z]+\d+\}/);
        const sheet = computeSheet(f.cells);
        for (const a of f.changed) expect(isErr(sheet.get(a)?.value ?? null), `${wb.id} ${a}`).toBe(false);
      }
    }
  });

  it('say how a copy moved the references', () => {
    const sln = walkOf(workbookOf('sln'));
    expect(sln[1].text).toContain('the formula becomes =SLN($B$1,$B$2,$B$3) in B7');
    expect(sln[1].text).toContain('$B$1, $B$2 and $B$3 stay, fixed by $');
    expect(sln[3].text).toContain('$B$6:B6 becomes $B$6:B7');
    const brs = walkOf(workbookOf('brs'));
    expect(brs[1].text).toContain('B2:B6 is relative and moves one column to the right');
    expect(brs[1].text).toContain('=SUM(C2:C6) in C7');
    expect(brs[2].text).toContain('₹56,100 - ₹12,500 = ₹43,600');
    const db = walkOf(workbookOf('db'));
    expect(db[2].text).toContain('₹1,60,000 × 50% = ₹80,000');
    expect(db[6].text).toContain('the book value is ₹10,000');
    const loan = walkOf(workbookOf('loan'));
    expect(loan[0].text).toContain('₹1,33,100');
    expect(loan[7].text).toContain('the balance at the end is ₹0');
  });
});

describe('new figures for Play', () => {
  it('keep every figure in whole rupees and every sheet free of errors, and the schedules close', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const wb of WORKBOOKS) {
        const rng = createRng(seed * 31 + wb.id.length);
        const cells = playSheet(wb, rng);
        const sheet = computeSheet(cells);
        for (const [a, c] of sheet) expect(isErr(c.value), `${wb.id} seed ${seed} ${a}`).toBe(false);
        const whole = (a: string) => expect(Math.abs(numberIn(sheet, a) - Math.round(numberIn(sheet, a))), `${wb.id} ${seed} ${a}`).toBeLessThan(1e-6);
        if (wb.id === 'db') {
          ['C7', 'C8', 'C9', 'C10'].forEach(whole);
          expect(numberIn(sheet, 'D10')).toBeCloseTo(numberIn(sheet, 'B2'), 4);
        }
        if (wb.id === 'wdv') ['C5', 'C6', 'C7'].forEach(whole);
        if (wb.id === 'sln') expect(numberIn(sheet, 'D9')).toBe(numberIn(sheet, 'B2'));
        if (wb.id === 'loan') {
          ['B4', 'C7', 'C8', 'C9', 'D7', 'D8', 'D9'].forEach(whole);
          expect(Math.abs(numberIn(sheet, 'E9'))).toBeLessThan(1e-4);
        }
      }
    }
  });

  it('are the same for the same seed', () => {
    expect(freshFigures('loan', createRng(5))).toEqual(freshFigures('loan', createRng(5)));
    const wb = workbookOf('brs');
    expect(withFigures(wb, { B2: 1000 }).B2).toEqual({ input: '1000', format: 'inr' });
  });
});
