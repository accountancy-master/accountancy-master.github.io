import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { EXAMPLES, randomYear } from './examples';
import { figureOf, FIGURE_GROUPS, LABEL, statementAmount, statementOf, withFigure, type CashFlowYear } from './model';
import { partsDone, rowsShown, stepsOf } from './steps';
import { ACTIVITY_BANK, activityQuestion, DIRECTION_BANK, directionQuestion, figureQuestion, hiddenRows, markFigure, parseRupees } from './tryit';

const R = (n: number) => n * 100;
const ex = (id: string): CashFlowYear => EXAMPLES.find((e) => e.id === id)!.year;
const amountOf = (y: CashFlowYear, id: string) => statementOf(y).rows.find((r) => r.id === id)?.amount;

describe('the cash flow statement (indirect method, a company that is not a financing company)', () => {
  it('works the growing year as by hand', () => {
    const s = statementOf(ex('growing'));
    // 3,20,000 + 60,000 + 20,000 + loss 10,000 + interest 30,000 − dividend 15,000
    expect(s.opProfit).toBe(R(425000));
    // − inventories 40,000 + receivables 15,000 + payables 25,000 − outstanding expenses 8,000
    expect(s.cgo).toBe(R(417000));
    expect(s.operating).toBe(R(332000));
    // − 3,60,000 + 40,000 − 50,000 + 15,000
    expect(s.investing).toBe(R(-355000));
    // + 1,50,000 + 20,000 − 30,000 − 80,000
    expect(s.financing).toBe(R(60000));
    expect(s.net).toBe(R(37000));
    expect(s.closing).toBe(R(100000));
    expect(amountOf(ex('growing'), 'loss')).toBe(R(10000));
    expect(amountOf(ex('growing'), 'sold')).toBe(R(40000));
    expect(amountOf(ex('growing'), 'wc-outstandingExpenses')).toBe(R(-8000));
  });

  it('starts a loss year from a minus figure and still finds cash from operations', () => {
    const y = ex('loss');
    const s = statementOf(y);
    expect(s.rows.find((r) => r.id === 'npbt')?.amount).toBe(R(-40000));
    // −40,000 + 90,000 − profit on sale 15,000 + interest 24,000
    expect(s.opProfit).toBe(R(59000));
    expect(amountOf(y, 'profit')).toBe(R(-15000));
    expect(amountOf(y, 'sold')).toBe(R(75000));
    expect(s.cgo).toBe(R(94000));
    expect(s.operating).toBe(R(84000));
    expect(s.investing).toBe(R(35000));
    expect(s.financing).toBe(R(-124000));
    expect(s.net).toBe(R(-5000));
    expect(s.closing).toBe(R(40000));
    expect(s.rows.find((r) => r.id === 'net-change')?.label).toBe('Net decrease in cash and cash equivalents');
    expect(s.rows.find((r) => r.id === 'net-investing')?.label).toBe('Net cash from investing activities');
    expect(s.rows.find((r) => r.id === 'net-financing')?.label).toBe('Net cash used in financing activities');
  });

  it('shows a profit that is not cash: profit up, cash down', () => {
    const s = statementOf(ex('squeeze'));
    expect(s.opProfit).toBe(R(430000));
    expect(s.cgo).toBe(R(200000));
    expect(s.operating).toBe(R(90000));
    expect(s.investing).toBe(R(-230000));
    expect(s.financing).toBe(R(40000));
    expect(s.closing).toBe(R(80000));
  });

  it('keeps the board’s order and wording, and leaves out rows of nil', () => {
    const s = statementOf(ex('growing'));
    const labels = s.rows.map((r) => r.label);
    const order = [
      'A. Cash flows from operating activities',
      LABEL.npbt,
      LABEL.depreciation,
      LABEL.opProfit,
      LABEL.cgo,
      LABEL.tax,
      'Net cash from operating activities',
      'B. Cash flows from investing activities',
      LABEL.bought,
      'Net cash used in investing activities',
      'C. Cash flows from financing activities',
      LABEL.shares,
      LABEL.interestPaid,
      'Net cash from financing activities',
      'Net increase in cash and cash equivalents',
      LABEL.opening,
      LABEL.closing,
    ];
    const at = order.map((l) => labels.indexOf(l));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(labels).not.toContain(LABEL.debentures);
    expect(labels).not.toContain(LABEL.profit);
    expect(labels).toContain('Increase in inventories');
    expect(labels).toContain('Decrease in trade receivables');
    expect(labels).toContain('Increase in trade payables');
    expect(labels).toContain('Decrease in outstanding expenses');
    expect(labels).toContain('Increase in bank overdraft');
  });

  it('turns each working capital change the right way', () => {
    const base: CashFlowYear = { ...ex('growing'), wc: [] };
    const one = (id: CashFlowYear['wc'][number]['id'], open: number, close: number) => amountOf({ ...base, wc: [{ id, open: R(open), close: R(close) }] }, `wc-${id}`);
    expect(one('inventories', 100, 150)).toBe(R(-50));
    expect(one('inventories', 150, 100)).toBe(R(50));
    expect(one('tradeReceivables', 100, 130)).toBe(R(-30));
    expect(one('prepaidExpenses', 10, 4)).toBe(R(6));
    expect(one('tradePayables', 100, 130)).toBe(R(30));
    expect(one('tradePayables', 130, 100)).toBe(R(-30));
    expect(one('outstandingExpenses', 20, 35)).toBe(R(15));
    // No change, no row.
    expect(one('inventories', 100, 100)).toBeUndefined();
  });

  it('puts a fall in bank overdraft under financing as an outflow', () => {
    const y = { ...ex('growing'), overdraftChange: R(-25000) };
    const row = statementOf(y).rows.find((r) => r.id === 'overdraft')!;
    expect(row.label).toBe('Decrease in bank overdraft');
    expect(row.amount).toBe(R(-25000));
    expect(row.section).toBe('financing');
  });

  it('shows a machine sold at its book value under investing only', () => {
    const y = { ...ex('growing'), sale: { book: R(50000), price: R(50000) } };
    const ids = statementOf(y).rows.map((r) => r.id);
    expect(ids).not.toContain('loss');
    expect(ids).not.toContain('profit');
    expect(amountOf(y, 'sold')).toBe(R(50000));
  });

  it('draws every row as a step from where the last one ended, and every part adds up', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 77, 404, 9001]) {
      const y = randomYear(seed);
      const s = statementOf(y);
      let run = 0;
      for (const r of s.rows) {
        if (r.kind === 'item') {
          expect(r.from, `${seed} ${r.id}`).toBe(run);
          expect(r.to).toBe(r.from + r.amount);
          run = r.to;
        } else if (r.kind === 'subtotal' || r.kind === 'final') {
          expect(r.from).toBe(0);
          if (r.id !== 'net-change' && r.id !== 'closing') expect(r.to, `${seed} ${r.id}`).toBe(run);
          run = r.to;
        } else if (r.kind === 'heading') run = 0;
      }
      expect(s.closing).toBe(y.openingCash + s.operating + s.investing + s.financing);
      expect(s.closing).toBeGreaterThanOrEqual(R(10000));
    }
  });

  it('makes the same year from the same seed', () => {
    expect(randomYear(42)).toEqual(randomYear(42));
    expect(randomYear(42)).not.toEqual(randomYear(43));
  });

  it('prints an outflow in brackets, as an examination paper does', () => {
    expect(statementAmount(R(-30000))).toBe('(30,000)');
    expect(statementAmount(R(332000))).toBe('3,32,000');
  });
});

describe('the sandbox figures', () => {
  it('reads and changes every figure it offers', () => {
    const y = ex('growing');
    for (const g of FIGURE_GROUPS)
      for (const f of g.figures) {
        const changed = withFigure(y, f.key, f.max);
        expect(figureOf(changed, f.key), f.key).toBe(f.max);
        expect(Math.abs(f.min % f.step)).toBe(0);
        expect(f.max % f.step).toBe(0);
      }
  });

  it('never lets a balance or an amount paid fall below nil, but lets the profit be a loss', () => {
    const y = ex('growing');
    expect(figureOf(withFigure(y, 'depreciation', R(-5)), 'depreciation')).toBe(0);
    expect(figureOf(withFigure(y, 'npbt', R(-50000)), 'npbt')).toBe(R(-50000));
    expect(figureOf(withFigure(y, 'overdraftChange', R(-50000)), 'overdraftChange')).toBe(R(-50000));
  });

  it('adds a working capital item that was not there, and drops one emptied at both dates', () => {
    const y = ex('loss');
    const added = withFigure(y, 'wc:prepaidExpenses:close', R(8000));
    expect(added.wc.find((w) => w.id === 'prepaidExpenses')).toEqual({ id: 'prepaidExpenses', open: 0, close: R(8000) });
    expect(amountOf(added, 'wc-prepaidExpenses')).toBe(R(-8000));
    const emptied = withFigure(withFigure(y, 'wc:tradePayables:open', 0), 'wc:tradePayables:close', 0);
    expect(emptied.wc.some((w) => w.id === 'tradePayables')).toBe(false);
  });

  it('drops the sale when its book value and price are both nil, and works a sale of a written-off machine', () => {
    const y = ex('growing');
    expect(withFigure(withFigure(y, 'saleBook', 0), 'salePrice', 0).sale).toBeNull();
    const scrap = withFigure(y, 'saleBook', 0);
    expect(amountOf(scrap, 'profit')).toBe(R(-40000));
    expect(amountOf(scrap, 'sold')).toBe(R(40000));
  });
});

describe('the walk-through', () => {
  it('writes every figure of the statement once, nets as the pipes empty', () => {
    const s = statementOf(ex('growing'));
    const steps = stepsOf(s);
    expect(steps.map((st) => st.rowId)).toEqual(s.rows.filter((r) => r.kind !== 'heading' && r.kind !== 'subhead').map((r) => r.id));
    expect(steps.filter((st) => st.flows).map((st) => st.flows)).toEqual(['operating', 'investing', 'financing']);
    expect(steps[1].headline).toBe('Add: Depreciation on machinery, ₹60,000');
    expect(steps.find((st) => st.rowId === 'tax')?.headline).toBe('Less: Income tax paid, ₹85,000');
    const opIndex = steps.findIndex((st) => st.flows === 'operating');
    expect(partsDone(steps, opIndex)).toEqual({ operating: false, investing: false, financing: false });
    expect(partsDone(steps, opIndex + 1)).toEqual({ operating: true, investing: false, financing: false });
    expect(partsDone(steps, steps.length)).toEqual({ operating: true, investing: true, financing: true });
  });

  it('shows a heading with the first figure under it', () => {
    const s = statementOf(ex('growing'));
    const steps = stepsOf(s);
    expect(rowsShown(s, steps, 0).size).toBe(0);
    expect([...rowsShown(s, steps, 1)]).toEqual(['h-operating', 'npbt']);
    expect(rowsShown(s, steps, 2).has('sh-adjust')).toBe(true);
    expect(rowsShown(s, steps, steps.length).size).toBe(s.rows.length);
  });
});

describe('try it', () => {
  it('has a right answer among the options for every item', () => {
    for (const [, answer] of ACTIVITY_BANK) expect(['operating', 'investing', 'financing', 'none']).toContain(answer);
    for (const [, answer] of DIRECTION_BANK) expect(['add', 'deduct', 'none']).toContain(answer);
    const rng = createRng(3);
    for (let i = 0; i < 20; i++) {
      const a = activityQuestion(rng);
      expect(a.options.map((o) => o.id)).toContain(a.answer);
      const d = directionQuestion(rng);
      expect(d.options.map((o) => o.id)).toContain(d.answer);
    }
  });

  it('agrees with the statement on the direction of every adjustment it shares with it', () => {
    const y = ex('growing');
    const s = statementOf(y);
    const dep = DIRECTION_BANK.find(([item]) => item.startsWith('Depreciation'))!;
    expect(dep[1]).toBe(s.rows.find((r) => r.id === 'depreciation')!.amount > 0 ? 'add' : 'deduct');
    const div = DIRECTION_BANK.find(([item]) => item.startsWith('Dividend received'))!;
    expect(div[1]).toBe(s.rows.find((r) => r.id === 'dividend-received-adj')!.amount > 0 ? 'add' : 'deduct');
  });

  it('asks a figure of the statement and marks it, telling the slips it knows', () => {
    const y = ex('growing');
    for (let seed = 1; seed < 30; seed++) {
      const q = figureQuestion(y, createRng(seed));
      const s = statementOf(y);
      const expected = { 'op-profit': s.opProfit, cgo: s.cgo, 'net-operating': s.operating, closing: s.closing }[q.target];
      expect(q.answer).toBe(expected);
      expect(hiddenRows(q).has(q.target)).toBe(true);
      expect(markFigure(q, statementAmount(q.answer)).right).toBe(true);
      expect(markFigure(q, String(q.answer / 100 + 1000)).right).toBe(false);
      if (q.target === 'net-operating') {
        expect(q.working.at(-1)).toBe('Net cash from (or used in) operating activities = 4,17,000 − tax paid 85,000 = 3,32,000.');
        expect(markFigure(q, '4,17,000').why).toContain('tax paid has still to come off');
      }
    }
  });

  it('reads amounts as a student types them', () => {
    expect(parseRupees('3,32,000')).toBe(R(332000));
    expect(parseRupees('₹ 3,32,000')).toBe(R(332000));
    expect(parseRupees('-5000')).toBe(R(-5000));
    expect(parseRupees('− 5,000')).toBe(R(-5000));
    expect(parseRupees('(5,000)')).toBe(R(-5000));
    expect(parseRupees('five')).toBeNull();
    expect(parseRupees('')).toBeNull();
  });
});
