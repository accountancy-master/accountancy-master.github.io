import { describe, expect, it } from 'vitest';
import { isErr } from './evaluate';
import { computeSheet, numberIn, readInput } from './sheet';
import { askRng, judgeFigure, parseFigure, sheetAsk, SHEET_ASK_KINDS, type SheetAsk } from './tryit';

const asks = (kind: (typeof SHEET_ASK_KINDS)[number], count = 150): SheetAsk[] => Array.from({ length: count }, (_, n) => sheetAsk(kind, askRng(3, kind, n)));
const fig = (ask: SheetAsk, addr: string) => {
  const i = readInput(ask.sheet.cells[addr]?.input ?? '');
  return i.type === 'number' ? i.value : NaN;
};

describe('the Try-it questions', () => {
  it('are the same for the same seed, and differ from one to the next', () => {
    for (const kind of SHEET_ASK_KINDS) {
      expect(sheetAsk(kind, askRng(9, kind, 2))).toEqual(sheetAsk(kind, askRng(9, kind, 2)));
      expect(new Set(asks(kind, 20).map((a) => a.prompt)).size, kind).toBeGreaterThan(5);
    }
  });

  it('what the formula gives: the figure as the sheet works it out, the slips named and never the answer', () => {
    for (const a of asks('value')) {
      if (a.answer.type !== 'figure') throw new Error('a figure was expected');
      const computed = computeSheet(a.sheet.cells);
      expect(numberIn(computed, 'C2'), a.prompt).toBeCloseTo(a.answer.value, 2);
      expect(a.answer.mistakes.length, a.prompt).toBeGreaterThan(0);
      for (const m of a.answer.mistakes) expect(Math.abs(m.value - a.answer.value), a.prompt).toBeGreaterThan(0.004);
      expect(a.reason).toContain('C2 shows');
    }
    // Worked by hand: the order of working, the >= of IF, SLN and the quick ratio.
    for (const a of asks('value', 300)) {
      if (a.answer.type !== 'figure') continue;
      const b1 = fig(a, 'B1');
      const b2 = fig(a, 'B2');
      const b3 = fig(a, 'B3');
      if (a.prompt.includes('=B1+B2/2')) expect(a.answer.value).toBe(b1 + b2 / 2);
      if (a.prompt.includes('=SLN(B1,B2,B3)')) expect(a.answer.value).toBe((b1 - b2) / b3);
      if (a.prompt.includes('=B1+B2-B3-B4')) expect(a.answer.value).toBe(b1 + b2 - b3 - fig(a, 'B4'));
      if (a.prompt.includes('=ROUND((B1-B2)/B3,2)')) expect(a.answer.value).toBe(Math.round(((b1 - b2) / b3) * 100 + 1e-9) / 100);
      const m = /=IF\(B1>=(\d+),B1\*(\d+)\/100,B1\*(\d+)\/100\)/.exec(a.prompt);
      if (m) expect(a.answer.value).toBe((b1 * Number(b1 >= Number(m[1]) ? m[2] : m[3])) / 100);
    }
    // COUNT is asked of a varying number of invoices received, not always the same count.
    const counts = new Set(asks('value', 300).filter((a) => a.prompt.includes('COUNT')).map((a) => (a.answer as { value: number }).value));
    expect(counts.size).toBeGreaterThan(2);
  });

  it('what a copied formula becomes: the topic\'s examples, with the slips', () => {
    const all = asks('copy', 300);
    const d5 = all.find((a) => a.prompt.startsWith('D2 holds =B2*$C$1. It is copied to D5.'))!;
    if (d5.answer.type !== 'choice') throw new Error('a choice was expected');
    const texts = d5.answer.options.map((o) => o.text);
    expect(d5.answer.options.find((o) => o.id === (d5.answer as { correct: string }).correct)!.text).toBe('=B5*$C$1');
    expect(texts).toContain('=B2*$C$1');
    expect(d5.answer.options.find((o) => o.text === '=B2*$C$1')!.why).toMatch(/exactly as typed/);
    const up = all.find((a) => a.prompt.startsWith('D5 holds =B5-B4'))!;
    if (up.answer.type !== 'choice') throw new Error('a choice was expected');
    expect(up.answer.options.find((o) => o.id === (up.answer as { correct: string }).correct)!.text).toBe('=B1-#REF!');
    for (const a of all) {
      if (a.answer.type !== 'choice') throw new Error('a choice was expected');
      expect(a.answer.options.length, a.prompt).toBeGreaterThanOrEqual(3);
      expect(new Set(a.answer.options.map((o) => o.text)).size).toBe(a.answer.options.length);
      for (const o of a.answer.options) if (o.id !== a.answer.correct) expect(o.why, a.prompt).toBeTruthy();
      expect(a.after!.cells[a.focus].input).toBe(a.answer.options.find((o) => o.id === (a.answer as { correct: string }).correct)!.text);
    }
  });

  it('which formula: four options, each wrong one named with what it would give, the right one giving the figure', () => {
    for (const a of asks('which')) {
      if (a.answer.type !== 'choice') throw new Error('a choice was expected');
      expect(a.answer.options.length, a.prompt).toBe(4);
      for (const o of a.answer.options) if (o.id !== a.answer.correct) expect(o.why, a.prompt).toMatch(/It would give/);
      const after = computeSheet(a.after!.cells);
      expect(isErr(after.get(a.focus)?.value ?? null), a.prompt).toBe(false);
    }
    // The angle copied down with a relative total breaks with #DIV/0!.
    const pie = asks('which', 300).find((a) => a.prompt.includes('angle of each slice'))!;
    if (pie.answer.type !== 'choice') throw new Error('a choice was expected');
    expect(pie.answer.options.find((o) => o.text === '=B2/B7*360')?.why).toMatch(/#DIV\/0!/);
    expect(numberIn(computeSheet(pie.after!.cells), 'C2') + numberIn(computeSheet(pie.after!.cells), 'C3')).toBeGreaterThan(0);
    // The written down value slip names the rate on the sheet, not a fixed 25%.
    for (const a of asks('which', 300).filter((x) => x.prompt.includes('written down value'))) {
      if (a.answer.type !== 'choice') continue;
      const rate = a.sheet.cells.B2.input;
      expect(a.answer.options.find((o) => o.text === '=A5*$B$2/100')?.why).toContain(`${rate} being`);
    }
  });

  it('spot the wrong reference: the sheet shows the damage, the right reference mends it', () => {
    const seen = new Set<string>();
    for (const a of asks('wrong-ref')) {
      if (a.answer.type !== 'token') throw new Error('a token was expected');
      const ids = a.answer.parts.filter((p) => 'id' in p).map((p) => (p as { id: string }).id);
      expect(ids, a.prompt).toContain(a.answer.correct);
      for (const id of ids) if (id !== a.answer.correct) expect(a.answer.whys[id], `${a.prompt} ${id}`).toBeTruthy();
      expect(a.answer.parts.map((p) => p.text).join(''), a.prompt).toBe(a.sheet.cells[a.focus].input);
      // Mended, nothing on the sheet is an error.
      const fixed = computeSheet(a.after!.cells);
      for (const [addr, c] of fixed) expect(isErr(c.value), `${a.prompt} ${addr}`).toBe(false);
      seen.add(a.answer.correct);
    }
    expect([...seen].sort()).toEqual(['$A$6', 'B2', 'B3', 'B4', 'B7']);
  });

  it('read and mark a typed figure', () => {
    expect(parseFigure('₹ 4,000')).toBe(4000);
    expect(parseFigure('-500')).toBe(-500);
    expect(parseFigure('2.25')).toBe(2.25);
    expect(parseFigure('two')).toBeNull();
    const answer = { type: 'figure' as const, value: 4000, unit: 'rupee' as const, mistakes: [{ value: 1600, why: 'Took the condition as false.' }] };
    expect(judgeFigure(answer, '4,000').right).toBe(true);
    expect(judgeFigure(answer, '1600')).toEqual({ right: false, why: 'Took the condition as false.' });
    expect(judgeFigure(answer, '12').why).toBe('₹12 is not it.');
  });
});
