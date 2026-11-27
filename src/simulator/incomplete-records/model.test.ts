import { describe, expect, it } from 'vitest';
import { judge } from '@/components/simulator/labs/kit/answers';
import { rupees as R } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { EXAMPLES, randomInputs } from './examples';
import { affairsOf, problemOf, profitStatement, resultOf, PL, type Inputs } from './model';
import { askRng, irAsk, IR_ASK_KINDS } from './tryit';
import { standingAfter, upTo, walkOf } from './walk';

const [menon, sheikh, joshi] = EXAMPLES.map((e) => e.inputs);

describe('the statement of affairs method, worked by hand', () => {
  it('Menon Hardware: a profit, with drawings in cash and goods, capital brought in and four adjustments', () => {
    // Opening: 15,000 + 45,000 + 80,000 + 1,20,000 + 50,000 = 3,10,000; less 60,000 + 5,000 = 2,45,000.
    // Closing: 20,000 + 70,000 + 1,10,000 + 1,60,000 + 50,000 = 4,10,000; less 75,000 + 50,000 = 2,85,000.
    // Drawings 4,000 x 12 + goods at cost 6,000 = 54,000; additional capital 30,000.
    // 2,85,000 + 54,000 - 30,000 - 2,45,000 = 64,000. Interest 6% of 2,45,000 = 14,700; depreciation 10% of 50,000
    // = 5,000; provision 5% of 1,10,000 = 5,500; prepaid insurance + 2,000: net 40,800.
    const r = resultOf(menon);
    expect(r.assets).toEqual([R(310000), R(410000)]);
    expect(r.capital).toEqual([R(245000), R(285000)]);
    expect(r.drawings).toBe(R(54000));
    expect(r.adjusted).toBe(R(309000));
    expect(r.before).toBe(R(64000));
    expect(r.adjs.map((a) => [a.label, a.effect])).toEqual([
      ['Less: Interest on capital', -R(14700)],
      ['Less: Depreciation on furniture', -R(5000)],
      ['Less: Provision for doubtful debts', -R(5500)],
      ['Add: Prepaid insurance', R(2000)],
    ]);
    expect(r.net).toBe(R(40800));
  });

  it('Sheikh Tailors: a loss, the salary and a private bill as drawings, an overdraft at the end', () => {
    // Opening 2,08,000 - 30,000 = 1,78,000; closing 1,81,000 - 55,000 = 1,26,000.
    // 1,26,000 + (3,000 x 12 + 9,000) - 1,78,000 = -7,000; - 10,000 - 3,000 + 1,500 = -18,500.
    const r = resultOf(sheikh);
    expect(r.capital).toEqual([R(178000), R(126000)]);
    expect(r.drawings).toBe(R(45000));
    expect(r.before).toBe(-R(7000));
    expect(r.net).toBe(-R(18500));
  });

  it('Joshi Sweets: the capital falls by 40,000, yet the year made a profit of 50,000', () => {
    const r = resultOf(joshi);
    expect(r.capital).toEqual([R(500000), R(460000)]);
    expect(r.before).toBe(R(50000));
    expect(r.adjs).toEqual([]);
  });

  it('writes the board formats: the statement of affairs balances, the profit statement adds up', () => {
    for (const e of EXAMPLES) {
      const a = affairsOf(e.inputs);
      const sum = (rows: typeof a.assets, k: 'open' | 'close') => rows.filter((x) => !x.total).reduce((t, x) => t + x[k], 0);
      for (const k of ['open', 'close'] as const) expect(sum(a.liabilities, k), `${e.id} ${k}`).toBe(sum(a.assets, k));
      const rows = profitStatement(e.inputs);
      const r = resultOf(e.inputs);
      expect(rows.find((x) => x.label === PL.adjusted)!.amount).toBe(r.capital[1] + r.drawings - r.additional);
      expect(rows.at(-1)!.amount).toBe(r.net);
      // Each sub-total is the sum of the lines above it since the last sub-total (the first counts from the top).
      let run = 0;
      for (const row of rows) {
        if (row.subtotal) {
          expect(row.amount, `${e.id} ${row.label}`).toBe(run);
          run = row.amount;
        } else run += row.amount;
      }
    }
  });

  it('refuses inputs that cannot be', () => {
    const broke: Inputs = { ...menon, items: menon.items.map((x) => (x.id === 'creditors' ? { ...x, open: R(400000) } : x)) };
    expect(problemOf(broke)).toMatch(/no capital to begin with/);
    for (const e of EXAMPLES) expect(problemOf(e.inputs)).toBeNull();
  });

  it('makes traders from a seed that hold, in whole rupees', () => {
    for (let s = 1; s <= 80; s++) {
      const i = randomInputs(createRng(s));
      expect(problemOf(i), String(s)).toBeNull();
      const r = resultOf(i);
      for (const x of [...r.capital, r.drawings, r.before, r.net, ...r.adjs.map((a) => a.effect)]) expect(Math.abs(x) % 100, String(s)).toBe(0);
    }
  });
});

describe('the walk', () => {
  it('builds both statements, leaves the private item out, climbs the ladder and makes each adjustment', () => {
    const w = walkOf(menon);
    expect(w.map((s) => s.id)).toEqual([
      'open-assets', 'open-liabilities', 'open-capital', 'close-assets', 'close-liabilities', 'privates', 'close-capital',
      'ladder-close', 'ladder-drawings', 'ladder-additional', 'ladder-open', 'adj-ioc', 'adj-dep', 'adj-pdd', 'adj-pre',
    ]);
    expect(w.at(-1)!.text).toContain('a profit of ₹40,800');
    expect(w[10].text).toContain('₹64,000');
    const s = standingAfter(w, upTo(w, 'ladder-open'));
    expect(s.has('ladder-open') && !s.has('adj-ioc')).toBe(true);
    expect(walkOf(joshi).at(-1)!.text).toContain('the proprietor drew out more than the profit');
    expect(walkOf(sheikh).at(-1)!.text).toContain('a loss of ₹18,500');
  });
});

describe('the quick questions', () => {
  it('are sound for every kind and many seeds', () => {
    for (const kind of IR_ASK_KINDS) {
      for (let n = 0; n < 40; n++) {
        const ask = irAsk(kind, askRng(2, kind, n));
        const w = walkOf(ask.inputs);
        expect(ask.reveal, `${kind} ${n}`).toBeGreaterThanOrEqual(ask.shown);
        expect(ask.reveal).toBeLessThanOrEqual(w.length);
        const a = ask.answer;
        if (a.type === 'choice') {
          expect(new Set(a.options.map((o) => o.id)).size).toBe(a.options.length);
          expect(judge(a, { choice: a.correct }).right).toBe(true);
        } else {
          expect(a.value, `${kind} ${n}`).toBeGreaterThan(0);
          expect(judge(a, { figure: a.value, tag: a.tag?.correct ?? null }).right).toBe(true);
          expect(a.mistakes.length, `${kind} ${n}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('ask the profit before adjustments and the net result as the model has them', () => {
    for (let n = 0; n < 15; n++) {
      const p = irAsk('profit', askRng(9, 'profit', n));
      if (p.answer.type !== 'number') throw new Error('a figure');
      const r = resultOf(p.inputs);
      expect(p.answer.value).toBe(Math.abs(r.before));
      expect(p.answer.tag!.correct).toBe(r.before >= 0 ? 'profit' : 'loss');
      const q = irAsk('net', askRng(9, 'net', n));
      if (q.answer.type !== 'number') throw new Error('a figure');
      expect(q.answer.value).toBe(Math.abs(resultOf(q.inputs).net));
      // The word with the net result is about the net result, not about the comparison of the capitals.
      expect(q.answer.tag!.correct).toBe(resultOf(q.inputs).net >= 0 ? 'profit' : 'loss');
      expect(q.answer.tag!.options.map((o) => o.why).join(' ')).not.toContain('adjusted closing capital');
    }
  });
});
