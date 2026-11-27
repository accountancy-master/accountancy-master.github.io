import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { applyDeal, cannotPlay, dealById, DEALS, priceOf } from './deals';
import { CONTROL_GROUPS, EXAMPLES, randomFigures, setFigure } from './examples';
import { allRatios, balances, decimal, linesOf, movement, plugged, ratioDef, ratioOf, roundHundredths, shown, termWords, type RatioFigures, type RatioId } from './model';
import { effectWords, meaning, watchSteps, WATCH_DEALS } from './steps';
import { computeQuestion, effectQuestion, markCompute, parseRatio, TERM_BANK, TERM_OPTIONS, termQuestion } from './tryit';

const R = (n: number) => n * 100;
const ex = (id: string): RatioFigures => EXAMPLES.find((e) => e.id === id)!.figures;
const show = (f: RatioFigures, id: RatioId) => shown(ratioOf(ratioDef(id), linesOf(f)));

describe('the ratios of a steady company, as worked by hand', () => {
  const f = ex('steady');
  const l = linesOf(f);

  it('balances, and finds every term', () => {
    expect(balances(l)).toBe(true);
    expect(l.totalAssets).toBe(R(1800000));
    expect(l.currentAssets).toBe(R(600000));
    expect(l.currentLiabilities).toBe(R(300000));
    expect(l.revenue).toBe(R(2400000));
    expect(l.grossProfit).toBe(R(600000));
    expect(l.operatingProfit).toBe(R(240000));
    expect(l.pbit).toBe(R(260000));
    expect(l.pbt).toBe(R(220000));
    expect(l.tax).toBe(R(66000));
    expect(l.pat).toBe(R(154000));
    // 18,00,000 + 2,40,000 − 1,60,000
    expect(l.purchases).toBe(R(1880000));
  });

  it('gives every ratio', () => {
    const want: Record<RatioId, string> = {
      current: '2 : 1',
      // (6,00,000 − 2,40,000 − 20,000) ÷ 3,00,000 = 1.1333
      quick: '1.13 : 1',
      debtEquity: '0.5 : 1',
      assetsToDebt: '3.6 : 1',
      // 10,00,000 ÷ 18,00,000 = 0.5556
      proprietary: '0.56 : 1',
      interestCoverage: '6.5 times',
      // 18,00,000 ÷ ((1,60,000 + 2,40,000) ÷ 2)
      inventoryTurnover: '9 times',
      // 18,00,000 ÷ ((1,60,000 + 2,00,000) ÷ 2)
      receivablesTurnover: '10 times',
      // 18,80,000 ÷ ((1,76,000 + 2,00,000) ÷ 2)
      payablesTurnover: '10 times',
      workingCapitalTurnover: '8 times',
      grossProfit: '25%',
      operatingRatio: '90%',
      operatingProfit: '10%',
      // 1,54,000 ÷ 24,00,000 × 100 = 6.4167
      netProfit: '6.42%',
      // 2,60,000 ÷ 15,00,000 × 100 = 17.333
      roi: '17.33%',
    };
    for (const v of allRatios(f)) expect(shown(v), v.def.id).toBe(want[v.def.id]);
  });

  it('writes out the terms and the figures plugged in', () => {
    const q = ratioOf(ratioDef('quick'), l);
    expect(termWords(q.top, l)).toBe('Current investments ₹50,000 + Trade receivables ₹2,00,000 + Cash and cash equivalents ₹90,000 = ₹3,40,000');
    expect(plugged(q)).toBe('₹3,40,000 ÷ ₹3,00,000 = 1.13 : 1');
    const inv = ratioOf(ratioDef('inventoryTurnover'), l);
    expect(termWords(inv.bottom, l)).toBe('(Inventories at the start ₹1,60,000 + at the end ₹2,40,000) ÷ 2 = ₹2,00,000');
    expect(plugged(inv)).toBe('₹18,00,000 ÷ ₹2,00,000 (average) = 9 times');
    expect(plugged(ratioOf(ratioDef('grossProfit'), l))).toBe('₹6,00,000 ÷ ₹24,00,000 × 100 = 25%');
    const wc = ratioOf(ratioDef('workingCapitalTurnover'), l);
    expect(termWords(wc.bottom, l)).toContain('− Short-term borrowings ₹50,000');
    expect(meaning(ratioOf(ratioDef('receivablesTurnover'), l))).toContain('about 36 days');
  });
});

describe('the edge cases', () => {
  it('a current ratio below 1 : 1 and a negative working capital', () => {
    const f = ex('tight');
    const l = linesOf(f);
    expect(balances(l)).toBe(true);
    expect(show(f, 'current')).toBe('0.8 : 1');
    expect(show(f, 'quick')).toBe('0.38 : 1');
    const wc = ratioOf(ratioDef('workingCapitalTurnover'), l);
    expect(wc.hundredths).toBeNull();
    expect(wc.reason).toContain('Working capital is nil or below nil');
    // 11,25,000 ÷ 1,87,500 = 6; 12,00,000 ÷ 1,50,000 = 8; 11,50,000 ÷ 2,87,500 = 4
    expect(show(f, 'inventoryTurnover')).toBe('6 times');
    expect(show(f, 'receivablesTurnover')).toBe('8 times');
    expect(show(f, 'payablesTurnover')).toBe('4 times');
    // 52,500 ÷ 15,00,000 = 3.5%; 1,05,000 ÷ 8,50,000 = 12.35%
    expect(l.tax).toBe(R(22500));
    expect(show(f, 'netProfit')).toBe('3.5%');
    expect(show(f, 'roi')).toBe('12.35%');
  });

  it('a loss, a debit balance in reserves and interest not covered', () => {
    const f = ex('geared');
    const l = linesOf(f);
    expect(balances(l)).toBe(true);
    expect(l.shareholdersFunds).toBe(R(550000));
    expect(l.pbt).toBe(R(-40000));
    expect(l.tax).toBe(0);
    expect(show(f, 'debtEquity')).toBe('2.36 : 1');
    expect(show(f, 'assetsToDebt')).toBe('1.62 : 1');
    expect(show(f, 'proprietary')).toBe('0.26 : 1');
    expect(show(f, 'interestCoverage')).toBe('0.67 times');
    expect(show(f, 'netProfit')).toBe('−4%');
    expect(show(f, 'roi')).toBe('4.32%');
    expect(show(f, 'payablesTurnover')).toBe('4.8 times');
    expect(meaning(ratioOf(ratioDef('netProfit'), l))).toBe('There is a loss of ₹4 on every ₹100 of revenue after every expense.');
    expect(meaning(ratioOf(ratioDef('interestCoverage'), l))).toContain('does not cover even one year');
  });

  it('says why a ratio cannot be worked out', () => {
    const f = { ...ex('steady'), longTermBorrowings: 0, longTermProvisions: 0, financeCosts: 0, cash: ex('steady').cash - R(500000) + R(500000) };
    const l = linesOf(f);
    expect(ratioOf(ratioDef('assetsToDebt'), l).reason).toBe('There is no long-term debt to cover.');
    expect(ratioOf(ratioDef('interestCoverage'), l).reason).toBe('There is no interest on long-term debt to cover.');
    expect(show(f, 'debtEquity')).toBe('0 : 1');
  });

  it('rounds half away from nil, exactly', () => {
    expect(roundHundredths(1, 8)).toBe(13);
    expect(roundHundredths(-1, 8)).toBe(-13);
    expect(roundHundredths(2, 3)).toBe(67);
    expect(roundHundredths(1e12, 3e11)).toBe(333);
    expect(decimal(250)).toBe('2.5');
    expect(decimal(1013)).toBe('10.13');
    expect(decimal(800)).toBe('8');
    expect(decimal(-400)).toBe('−4');
    expect(decimal(5)).toBe('0.05');
  });
});

describe('transactions', () => {
  it('keep the balance sheet balanced', () => {
    for (const e of EXAMPLES)
      for (const d of DEALS) {
        const after = applyDeal(e.figures, d, R(20000));
        if (after) expect(balances(linesOf(after)), `${e.id} ${d.id}`).toBe(true);
      }
  });

  it('refuse to take a balance below nil, and say why', () => {
    const f = ex('steady');
    expect(applyDeal(f, dealById('payCreditors'), R(100000))).toBeNull();
    expect(cannotPlay(f, dealById('payCreditors'), R(100000))).toBe('Not enough: it needs ₹1,00,000 of cash, and there is ₹90,000.');
    expect(cannotPlay(f, dealById('payCreditors'), R(60000))).toBeNull();
  });

  it('move the ratios the way the board’s rules say', () => {
    const f = ex('steady');
    const before = linesOf(f);
    const move = (deal: string, x: number, id: RatioId) => movement(ratioDef(id), before, linesOf(applyDeal(f, dealById(deal as never), R(x))!));
    // Current ratio above 1 : 1: paying a creditor raises it, a credit purchase lowers it.
    expect(move('payCreditors', 60000, 'current')).toBe(1);
    expect(move('creditPurchase', 60000, 'current')).toBe(-1);
    expect(move('collectDebtors', 60000, 'current')).toBe(0);
    expect(move('cashPurchase', 60000, 'current')).toBe(0);
    expect(move('cashPurchase', 60000, 'quick')).toBe(-1);
    // Goods bought for cash are not credit purchases: the trade payables turnover does not move.
    expect(move('cashPurchase', 60000, 'payablesTurnover')).toBe(0);
    expect(move('creditPurchase', 60000, 'payablesTurnover')).not.toBe(0);
    expect(move('prepay', 20000, 'quick')).toBe(-1);
    expect(move('buyMachinery', 50000, 'current')).toBe(-1);
    expect(move('buyMachinery', 50000, 'assetsToDebt')).toBe(0);
    expect(move('issueDebentures', 100000, 'debtEquity')).toBe(1);
    expect(move('issueShares', 100000, 'debtEquity')).toBe(-1);
    expect(move('convertDebentures', 100000, 'roi')).toBe(0);
    expect(move('shortLoan', 50000, 'debtEquity')).toBe(0);
    expect(move('creditPurchase', 60000, 'inventoryTurnover')).toBe(-1);
    // Goods sold at 25% on cost, 20% on price, when the gross profit ratio is 25%: it falls.
    expect(move('sellGoodsCredit', 40000, 'grossProfit')).toBe(-1);
    expect(move('depreciation', 40000, 'proprietary')).toBe(-1);
    expect(move('depreciation', 40000, 'operatingRatio')).toBe(1);
    // Below 1 : 1 the same transaction works the other way round.
    const t = ex('tight');
    const tl = linesOf(t);
    expect(movement(ratioDef('current'), tl, linesOf(applyDeal(t, dealById('payCreditors'), R(40000))!))).toBe(-1);
    expect(movement(ratioDef('current'), tl, linesOf(applyDeal(t, dealById('creditPurchase'), R(40000))!))).toBe(1);
    expect(priceOf(R(40000))).toBe(R(50000));
  });

  it('tells the effect in words, with the rule about 1 : 1', () => {
    const f = ex('steady');
    const after = applyDeal(f, dealById('payCreditors'), R(60000))!;
    expect(effectWords('current', linesOf(f), linesOf(after))).toBe(
      'Current assets fall by ₹60,000; current liabilities fall by ₹60,000. The ratio was above 1 : 1, and taking the same amount from both terms raises it. It rises from 2 : 1 to 2.25 : 1.',
    );
    const same = applyDeal(f, dealById('collectDebtors'), R(60000))!;
    expect(effectWords('current', linesOf(f), linesOf(same))).toBe('Neither current assets nor current liabilities change. It stays at 2 : 1.');
  });
});

describe('the sandbox', () => {
  it('lets cash take up a change of the balance sheet, and no more than there is', () => {
    const f = ex('steady');
    const more = setFigure(f, 'inventories', R(300000));
    expect(more.cash).toBe(R(30000));
    expect(balances(linesOf(more))).toBe(true);
    const tooMuch = setFigure(f, 'inventories', R(500000));
    expect(tooMuch.inventories).toBe(R(330000));
    expect(tooMuch.cash).toBe(0);
    const shares = setFigure(f, 'shareCapital', R(900000));
    expect(shares.cash).toBe(R(190000));
    const cutPayables = setFigure(f, 'tradePayables', 0);
    expect(cutPayables.tradePayables).toBe(R(110000));
    expect(cutPayables.cash).toBe(0);
    // A fall in reserves is paid out of cash too, so it stops when the cash runs out; below nil is allowed.
    expect(setFigure(f, 'reserves', R(-100000)).reserves).toBe(R(110000));
    const debit = setFigure(ex('geared'), 'reserves', R(-70000));
    expect(debit.reserves).toBe(R(-70000));
    expect(debit.cash).toBe(R(60000));
    // The statement of profit and loss leaves the balance sheet alone.
    expect(setFigure(f, 'creditRevenue', R(2000000)).cash).toBe(f.cash);
    expect(setFigure(f, 'taxRate', 25).taxRate).toBe(25);
  });

  it('offers every figure on a step that reaches its ends', () => {
    for (const g of CONTROL_GROUPS)
      for (const s of g.figures) {
        expect(Math.abs(s.min % s.step), s.line).toBe(0);
        expect(s.max % s.step, s.line).toBe(0);
      }
  });

  it('makes companies whose balance sheets balance, from a seed', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const f = randomFigures(seed);
      const l = linesOf(f);
      expect(balances(l), String(seed)).toBe(true);
      expect(f.cash).toBeGreaterThanOrEqual(R(20000));
      expect(l.purchases).toBeGreaterThan(0);
      expect(ratioOf(ratioDef('current'), l).hundredths).not.toBeNull();
    }
    expect(randomFigures(5)).toEqual(randomFigures(5));
  });
});

describe('the walk-through', () => {
  it('shows the figures, every ratio, then the transactions on the dials', () => {
    const steps = watchSteps(ex('steady'));
    expect(steps).toHaveLength(1 + 15 + WATCH_DEALS.length);
    expect(steps[1].headline).toBe('Current ratio: 2 : 1');
    expect(steps[1].text).toContain('₹6,00,000 ÷ ₹3,00,000 = 2 : 1');
    const last = steps.slice(-3);
    expect(last[0].headline).toBe('The company paid ₹60,000 to its trade payables by cheque: the current ratio is now 2.25 : 1');
    // 6,60,000 ÷ 3,60,000
    expect(last[1].headline).toContain('the current ratio is now 1.83 : 1');
    // 7,00,000 ÷ 10,00,000
    expect(last[2].headline).toContain('the debt to equity ratio is now 0.7 : 1');
    for (const s of last) expect(balances(linesOf(s.figures))).toBe(true);
  });
});

describe('try it', () => {
  it('asks what a transaction does, and its answer is the arithmetic', () => {
    for (let seed = 1; seed < 40; seed++) {
      const f = seed % 2 ? ex('steady') : randomFigures(seed);
      const q = effectQuestion(f, createRng(seed))!;
      expect(q).not.toBeNull();
      const m = movement(ratioDef(q.ratio), linesOf(f), linesOf(q.after));
      expect(q.answer).toBe(m === 1 ? 'up' : m === -1 ? 'down' : 'same');
      expect(balances(linesOf(q.after))).toBe(true);
    }
  });

  it('marks a computed ratio to two decimal places and names a slip', () => {
    const f = ex('steady');
    for (let seed = 1; seed < 40; seed++) {
      const q = computeQuestion(f, createRng(seed))!;
      expect(markCompute(q, decimal(q.hundredths).replace('−', '-')).right, q.ratio).toBe(true);
      expect(markCompute(q, String(q.exact + 0.5)).right).toBe(false);
    }
    let quick = computeQuestion(f, createRng(1))!;
    for (let s = 2; quick.ratio !== 'quick'; s++) quick = computeQuestion(f, createRng(s))!;
    expect(markCompute(quick, '1.13 : 1').right).toBe(true);
    expect(markCompute(quick, '1.133').right).toBe(true);
    // (6,00,000 − 2,40,000) ÷ 3,00,000 = 1.2: prepaid expenses left in.
    expect(markCompute(quick, '1.2').why).toContain('left the prepaid expenses in');
    expect(markCompute(quick, 'two').right).toBe(false);
  });

  it('reads a ratio as it is typed', () => {
    expect(parseRatio('2.5')).toBe(2.5);
    expect(parseRatio('2.5 : 1')).toBe(2.5);
    expect(parseRatio('6.5 times')).toBe(6.5);
    expect(parseRatio('17.33%')).toBe(17.33);
    expect(parseRatio('−4')).toBe(-4);
    expect(parseRatio('.5')).toBe(0.5);
    expect(parseRatio('abc')).toBeNull();
  });

  it('places every item of the bank under one of its options', () => {
    const ids = TERM_OPTIONS.map((o) => o.id);
    for (const [, answer] of TERM_BANK) expect(ids).toContain(answer);
    const q = termQuestion(createRng(4));
    expect(q.options.map((o) => o.id)).toContain(q.answer);
  });
});
