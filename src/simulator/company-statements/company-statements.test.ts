import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { COMPANIES_READY, GIRNAR, randomCompany, SUTLEJ } from './examples';
import { headOf, ITEMS, placeWhy, SUBS } from './heads';
import { basesOf, bsTwo, changeOf, faceLines, faceRows, figured, isHalfway, notesOf, pcText, pctH, plTwo, problemOf, shareOf, totalOf, workPl } from './sheet';
import { askRng, CS_ASK_KINDS, csAsk, judgeCs, parsePercent } from './tryit';
import { commonSteps, comparativeSteps, linesOf, sortSteps } from './walk';

const rs = (p: number) => p / 100;
const line = (lines: ReturnType<typeof figured>, key: string) => lines.find((l) => l.key === key)!;

describe('the balance sheet in the Schedule III form, worked by hand', () => {
  it('Girnar Ltd.: one figure a sub-head, the notes with calls in arrears deducted, and totals that agree', () => {
    const rows = faceRows(GIRNAR.holdings);
    expect(rows.map((r) => [SUBS[r.sub].label, rs(r.amount)])).toEqual([
      ['Share Capital', 2180000],
      ['Reserves and Surplus', 720000],
      ['Long-term Borrowings', 500000],
      ['Long-term Provisions', 80000],
      ['Short-term Borrowings', 60000],
      ['Trade Payables', 300000],
      ['Other Current Liabilities', 40000],
      ['Short-term Provisions', 120000],
      ['Property, Plant and Equipment', 2400000],
      ['Intangible Assets', 200000],
      ['Non-current Investments', 300000],
      ['Inventories', 280000],
      ['Trade Receivables', 210000],
      ['Cash and Cash Equivalents', 590000],
      ['Other Current Assets', 20000],
    ]);
    expect([rs(totalOf(rows, false)), rs(totalOf(rows, true))]).toEqual([4000000, 4000000]);
    const notes = notesOf(rows);
    expect(notes[0].lines.map((l) => [l.label, rs(l.amount), l.less])).toEqual([
      ['Equity share capital', 2200000, false],
      ['Less: Calls in arrears', 20000, true],
    ]);
    const face = faceLines(rows);
    expect(face.filter((l) => l.kind === 'part' || l.kind === 'major').map((l) => (l.kind === 'part' || l.kind === 'major' ? l.text : ''))).toEqual([
      'I. EQUITY AND LIABILITIES', "Shareholders' Funds", 'Non-Current Liabilities', 'Current Liabilities', 'II. ASSETS', 'Non-Current Assets', 'Current Assets',
    ]);
    expect(face.filter((l) => l.kind === 'row').map((l) => (l.kind === 'row' ? l.note : ''))).toEqual(Array.from({ length: 15 }, (_, k) => String(k + 1)));
  });

  it('Sutlej Ltd.: an accumulated loss is a negative figure in Reserves and Surplus; the four parts of PPE and Intangible Assets each a line', () => {
    const rows = faceRows(SUTLEJ.holdings);
    const reserves = notesOf(rows).find((n) => n.sub === 'reserves')!;
    expect(reserves.lines.map((l) => [l.label, rs(l.amount), l.less])).toEqual([
      ['Securities Premium', 300000, false],
      ['Less: Debit balance of the Statement of Profit and Loss (accumulated loss)', 120000, true],
    ]);
    expect(rs(reserves.total)).toBe(180000);
    expect(rows.filter((r) => ['ppe', 'intangible', 'cwip'].includes(r.sub)).map((r) => rs(r.amount))).toEqual([2200000, 300000, 800000]);
    expect([rs(totalOf(rows, false)), rs(totalOf(rows, true))]).toEqual([4600000, 4600000]);
  });

  it('names the place of an item as the topic does, and says why a wrong place is wrong', () => {
    const overdraft = ITEMS.find((i) => i.id === 'overdraft')!;
    expect(headOf(overdraft.sub)).toBe('Current Liabilities: Short-term Borrowings');
    expect(placeWhy(overdraft, 'cash')).toContain('A liability is not deducted from an asset');
    expect(placeWhy(overdraft, 'inv')).toContain('owns');
    expect(headOf('cwip')).toBe('Non-Current Assets: Property, Plant and Equipment and Intangible Assets (Capital Work-in-Progress)');
    for (const i of ITEMS) for (const [s] of i.wrong) expect(s, i.id).not.toBe(i.sub);
  });
});

describe('the comparative and common size statements, worked by hand', () => {
  it('rounds a percentage to two decimal places, half away from nil', () => {
    expect([pctH(1, 8), pctH(1, 3), pctH(2, 3), pctH(-2, 3), pctH(1, 20000), pctH(-1, 20000), pctH(0, 5)]).toEqual([1250, 3333, 6667, -6667, 1, -1, 0]);
    expect(pctH(5, 0)).toBeNull();
    expect([isHalfway(1, 20000), isHalfway(1, 3)]).toEqual([true, false]);
    expect([pcText(2500), pcText(1250), pcText(1667), pcText(-3750), pcText(5)]).toEqual(['25', '12.5', '16.67', '-37.5', '0.05']);
  });

  it('a comparative balance sheet: the change on the earlier figure, a fall negative, a total with its own change', () => {
    const lines = figured(bsTwo(GIRNAR));
    expect(changeOf(line(lines, 'shareCapital').v)).toEqual({ change: 58000000, pct: 3625 });
    expect(changeOf(line(lines, 'reserves').v).pct).toBe(2857);
    expect(changeOf(line(lines, 'stb').v)).toEqual({ change: -3600000, pct: -3750 });
    expect(changeOf(line(lines, 'intangible').v)).toEqual({ change: 0, pct: 0 });
    expect(changeOf(line(lines, 'totalAssets').v)).toEqual({ change: 80000000, pct: 2500 });
    expect(line(lines, 'totalEl').v).toEqual(line(lines, 'totalAssets').v);
    // Nil on the earlier date: a change, and no percentage.
    expect(changeOf(line(figured(bsTwo(SUTLEJ)), 'ltla').v)).toEqual({ change: 20000000, pct: null });
  });

  it('a comparative Statement of Profit and Loss: totals and profits worked for each year first', () => {
    const w = workPl(GIRNAR.pl);
    expect([w.income, w.expenses, w.pbt, w.tax, w.pat].map((p) => p.map(rs))).toEqual([
      [4100000, 5150000], [3400000, 4250000], [700000, 900000], [210000, 270000], [490000, 630000],
    ]);
    const lines = figured(plTwo(GIRNAR.pl));
    expect(changeOf(line(lines, 'income').v).pct).toBe(2561);
    expect(changeOf(line(lines, 'pat').v).pct).toBe(2857);
    expect(changeOf(line(lines, 'exp4').v).pct).toBe(1528);
  });

  it('a common size statement: revenue from operations 100 (total income above it), or the total of the balance sheet 100', () => {
    const pl = plTwo(GIRNAR.pl);
    const base = basesOf(pl, 'pl');
    const f = figured(pl);
    expect(shareOf(line(f, 'rev').v, base)).toEqual([10000, 10000]);
    expect(shareOf(line(f, 'income').v, base)).toEqual([10250, 10300]);
    expect(shareOf(line(f, 'exp0').v, base)).toEqual([5500, 5600]);
    expect(shareOf(line(f, 'pat').v, base)).toEqual([1225, 1260]);
    const bs = bsTwo(GIRNAR);
    const b = basesOf(bs, 'bs');
    expect(b.map(rs)).toEqual([3200000, 4000000]);
    const g = figured(bs);
    expect(shareOf(line(g, 'shareCapital').v, b)).toEqual([5000, 5450]);
    expect(shareOf(line(g, 'cash').v, b)).toEqual([1150, 1475]);
    // Each half adds up to 100 exactly in the ready company.
    for (const k of [0, 1] as const) {
      const rows = g.filter((l) => l.kind === 'row');
      const assets = rows.filter((l) => ['ppe', 'intangible', 'nci', 'inv', 'tr', 'cash', 'oca'].includes(l.key));
      expect(assets.reduce((t, l) => t + shareOf(l.v, b)[k]!, 0)).toBe(10000);
    }
  });

  it('keeps every percentage of the ready companies clear of a half-way point, and their figures sound', () => {
    for (const c of COMPANIES_READY) {
      expect(problemOf(c), c.name).toBeNull();
      for (const st of ['bs', 'pl'] as const) {
        const lines = linesOf(c, st);
        const base = basesOf(lines, st);
        for (const l of figured(lines)) {
          expect(isHalfway(l.v[1] - l.v[0], l.v[0]), `${c.name} ${l.label}`).toBe(false);
          expect(isHalfway(l.v[0], base[0]) || isHalfway(l.v[1], base[1]), `${c.name} ${l.label}`).toBe(false);
        }
      }
    }
  });
});

describe('made-up companies', () => {
  it('balance on both dates, with a profit in both years, in whole rupees', () => {
    const rng = createRng(21);
    for (let k = 0; k < 150; k++) {
      const c = randomCompany(rng);
      expect(problemOf(c), c.name).toBeNull();
      expect(c.holdings.every((h) => h.amount > 0 && h.amount % 100 === 0)).toBe(true);
      expect(new Set(c.holdings.map((h) => h.id)).size).toBe(c.holdings.length);
      expect(workPl(c.pl).tax.every((t) => t % 100 === 0)).toBe(true);
    }
    expect(randomCompany(createRng(4))).toEqual(randomCompany(createRng(4)));
  });
});

describe('the walk-throughs', () => {
  it('deal every balance once, sub-head by sub-head, and end on the totals', () => {
    const steps = sortSteps(GIRNAR);
    expect(steps).toHaveLength(16);
    expect(steps.at(-1)!.placed.sort()).toEqual(GIRNAR.holdings.map((h) => h.id).sort());
    expect(steps[0].text).toContain('Calls in arrears');
    expect(steps.at(-1)!.text).toContain('The two totals agree');
  });

  it('work every line of a statement, then read it', () => {
    const c = comparativeSteps(GIRNAR, 'pl');
    expect(c).toHaveLength(figured(plTwo(GIRNAR.pl)).length + 1);
    expect(c[0].text).toBe('₹40,00,000 in 2024-25, ₹50,00,000 in 2025-26: up ₹10,00,000, which is 25% of ₹40,00,000, the earlier figure.');
    expect(c.at(-1)!.text).toContain('profit after tax rose 28.57%');
    const s = commonSteps(GIRNAR, 'bs');
    expect(s.find((x) => x.key === 'cash')!.text).toContain('14.75% on 31 March 2026');
    expect(comparativeSteps(SUTLEJ, 'bs').find((x) => x.key === 'ltla')!.text).toContain('no percentage');
    // A total that fell is said to have fallen, not to have "grown" by a negative percentage.
    expect(comparativeSteps(SUTLEJ, 'bs').at(-1)!.text).toContain('The total of the balance sheet fell 0.43%. The line that grew fastest is capital work-in-progress, up 300%.');
  });

  it('numbers the major heads of a statement of two dates by the heads it has, and heads the four parts of PPE and Intangible Assets', () => {
    const heads = bsTwo(SUTLEJ).filter((l) => l.kind === 'heading').map((l) => (l.kind === 'heading' ? l.text : ''));
    expect(heads).toEqual(['I. EQUITY AND LIABILITIES', "1. Shareholders' funds", '2. Non-current liabilities', '3. Current liabilities', 'II. ASSETS', '1. Non-current assets', '2. Current assets']);
    const face = faceLines(faceRows(SUTLEJ.holdings));
    const at = face.findIndex((l) => l.kind === 'group');
    expect(face[at]).toEqual({ kind: 'group', text: 'Property, Plant and Equipment and Intangible Assets' });
    expect(face.slice(at + 1, at + 4).map((l) => (l.kind === 'row' ? [l.sub, l.part] : null))).toEqual([['ppe', true], ['intangible', true], ['cwip', true]]);
    expect(face.filter((l) => l.kind === 'group')).toHaveLength(1);
  });
});

describe('the quick questions', () => {
  it('ask what the figures give, with named wrong answers', () => {
    for (const kind of CS_ASK_KINDS) {
      for (let n = 0; n < 50; n++) {
        const a = csAsk(kind, askRng(2, kind, n));
        if (a.answer.type === 'choice') {
          expect(a.answer.options).toHaveLength(4);
          expect(new Set(a.answer.options.map((o) => o.id)).size).toBe(4);
          expect(judgeCs(a.answer, { choice: a.answer.correct }).right).toBe(true);
        } else {
          expect(a.answer.value, a.prompt).toBeGreaterThan(0);
          expect(a.answer.mistakes.length, a.prompt).toBeGreaterThanOrEqual(1);
          const typed = pcText(a.answer.value);
          expect(judgeCs(a.answer, { typed, tag: a.answer.tag?.correct }).right, a.prompt).toBe(true);
          expect(judgeCs(a.answer, { typed: pcText(a.answer.mistakes[0].value), tag: a.answer.tag?.correct }).why).toBe(a.answer.mistakes[0].why);
        }
      }
    }
  });

  it('read a percentage as it is typed, and mark a slip of rounding', () => {
    expect([parsePercent('16.67'), parsePercent('25 %'), parsePercent('12.5%'), parsePercent('-3'), parsePercent('1.234')]).toEqual([1667, 2500, 1250, null, null]);
    const a = { type: 'percent' as const, value: 1667, mistakes: [{ value: 2000, why: 'Wrong base.' }] };
    expect(judgeCs(a, { typed: '16.66' }).why).toContain('Round on the third decimal place');
    expect(judgeCs(a, { typed: '16.70' }).why).toContain('Close, but not exact');
    expect(judgeCs(a, { typed: '20' }).why).toBe('Wrong base.');
    expect(judgeCs(a, { typed: '16.67' }).right).toBe(true);
  });
});
