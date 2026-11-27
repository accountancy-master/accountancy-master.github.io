import { describe, expect, it } from 'vitest';
import { judge } from '@/components/simulator/labs/kit/answers';
import { rupees } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { EXAMPLES, fits, randomInputs } from './examples';
import { stageOf, stepsOf } from './steps';
import { askRng, GW_ASK_KINDS, gwAsk } from './tryit';
import { goodwillPaise, problemOf, show, toPaise, value, working, type GwInputs } from './valuation';

const r = rupees;
const base: GwInputs = {
  firm: 'Test & Co.',
  lastYear: 2025,
  profits: [],
  adjustments: [],
  averaging: 'simple',
  weights: [1, 2, 3],
  remuneration: 0,
  books: { trade: r(1000000), goodwill: 0, nonTrade: 0, fictitious: 0, outside: 0 },
  rate: 10,
  purchase: 2,
  method: 'average',
};

describe('the valuation of goodwill, worked by hand', () => {
  it('corrects the profits, deducts the remuneration and values by every method (Mehra & Kapoor)', () => {
    const v = value(EXAMPLES[0].inputs);
    expect(v.years.map((y) => y.label)).toEqual(['2021-22', '2022-23', '2023-24', '2024-25']);
    // 2022-23: 1,20,000 + 30,000 (fire) - 10,000 (closing stock overvalued); 2023-24: 1,90,000 - 20,000 (land) + 10,000 (opening stock).
    expect(v.years.map((y) => y.normal)).toEqual([r(150000), r(140000), r(180000), r(190000)]);
    expect(v.total).toBe(r(660000));
    expect(toPaise(v.average)).toBe(r(165000));
    expect(toPaise(v.averageAfter)).toBe(r(140000));
    expect(v.capitalEmployed).toBe(r(800000));
    expect(toPaise(v.normalProfit)).toBe(r(80000));
    expect(toPaise(v.superProfit)).toBe(r(60000));
    expect(goodwillPaise(v, 'average')).toBe(r(420000));
    expect(goodwillPaise(v, 'super')).toBe(r(180000));
    expect(toPaise(v.capitalisedValue)).toBe(r(1400000));
    expect(goodwillPaise(v, 'capAverage')).toBe(r(600000));
    expect(goodwillPaise(v, 'capSuper')).toBe(r(600000));
    expect(working(v).at(-1)).toBe('Goodwill = super profit ₹60,000 x 3 years\' purchase = ₹1,80,000.');
  });

  it('weights the years, charges repairs and adds back their depreciation, and capitalises (Iyer & Nair)', () => {
    const v = value(EXAMPLES[1].inputs);
    // 2025-26: 1,80,000 - 20,000 repairs + 2,000 depreciation added back.
    expect(v.years.map((y) => y.normal)).toEqual([r(100000), r(130000), r(162000)]);
    expect(v.products).toBe(r(846000));
    expect(v.weightTotal).toBe(6);
    expect(toPaise(v.average)).toBe(r(141000));
    expect(v.capitalEmployed).toBe(r(750000));
    expect(toPaise(v.normalProfit)).toBe(r(112500));
    expect(toPaise(v.capitalisedValue)).toBe(r(940000));
    expect(goodwillPaise(v, 'capAverage')).toBe(r(190000));
    expect(goodwillPaise(v, 'capSuper')).toBe(r(190000));
    expect(goodwillPaise(v, 'super')).toBe(r(57000));
    expect(goodwillPaise(v, 'average')).toBe(r(282000));
  });

  it('deducts a loss year, and gives no goodwill where the average does not reach the normal profit', () => {
    const v = value(EXAMPLES[2].inputs);
    expect(v.total).toBe(r(400000));
    expect(toPaise(v.average)).toBe(r(80000));
    expect(toPaise(v.normalProfit)).toBe(r(96000));
    expect(toPaise(v.superProfit)).toBe(r(-16000));
    expect(goodwillPaise(v, 'super')).toBe(0);
    expect(goodwillPaise(v, 'capSuper')).toBe(0);
    expect(goodwillPaise(v, 'capAverage')).toBe(0);
    expect(goodwillPaise(v, 'average')).toBe(r(160000));
    expect(working(v, 'super').at(-1)).toContain('no super profit and no goodwill');
    expect(working(v, 'super')).toContain('Super profit = ₹80,000 - ₹96,000 = - ₹16,000.');
  });

  it('matches the worked questions of the topic', () => {
    // q36: a loss by fire in 2022-23, closing stock of 2023-24 overvalued by ₹15,000, at 2 years' purchase.
    const q36 = value({
      ...base,
      profits: [r(90000), r(150000), r(120000)],
      adjustments: [{ kind: 'abnormalLoss', year: 0, amount: r(30000) }, { kind: 'stockOver', year: 1, amount: r(15000) }],
    });
    expect(q36.years.map((y) => y.normal)).toEqual([r(120000), r(135000), r(135000)]);
    expect(goodwillPaise(q36, 'average')).toBe(r(260000));
    // Card 11: weights 1, 2, 3 on ₹60,000, ₹90,000 and ₹1,20,000.
    expect(toPaise(value({ ...base, profits: [r(60000), r(90000), r(120000)], averaging: 'weighted' }).average)).toBe(r(100000));
    // q32: average ₹1,50,000 on ₹10,00,000 at 10%, 3 years' purchase of super profit.
    const q32 = value({ ...base, profits: [r(150000), r(150000), r(150000)], purchase: 3 });
    expect(goodwillPaise(q32, 'super')).toBe(r(150000));
    // q29: average ₹1,20,000 on ₹10,00,000 at 12%: the capitalised value equals the capital employed.
    const q29 = value({ ...base, profits: [r(120000), r(120000), r(120000)], rate: 12 });
    expect(goodwillPaise(q29, 'capAverage')).toBe(0);
    // q33: average ₹90,000; assets ₹10,00,000, outside liabilities ₹3,00,000; 10%.
    const q33 = value({ ...base, profits: [r(90000), r(90000), r(90000)], books: { ...base.books, outside: r(300000) } });
    expect(goodwillPaise(q33, 'capAverage')).toBe(r(200000));
  });

  it('corrects closing stock of the last year in that year only, and a half year of purchase', () => {
    const v = value({ ...base, profits: [r(100000), r(100000), r(100000)], adjustments: [{ kind: 'stockUnder', year: 2, amount: r(9000) }], purchase: 2.5 });
    expect(v.years.map((y) => y.normal)).toEqual([r(100000), r(100000), r(109000)]);
    expect(toPaise(v.average)).toBe(r(103000));
    expect(goodwillPaise(v, 'average')).toBe(r(257500));
  });

  it('leaves goodwill, non-trade investments and a fictitious asset out of the capital employed', () => {
    const v = value({ ...base, profits: [r(100000), r(100000), r(100000)], books: { trade: r(950000), goodwill: r(100000), nonTrade: r(150000), fictitious: r(20000), outside: r(250000) }, method: 'super' });
    expect(v.capitalEmployed).toBe(r(700000));
    expect(working(v)).toContain('Capital employed = assets used in the business ₹9,50,000 (leaving out goodwill ₹1,00,000, non-trade investments ₹1,50,000, deferred advertisement expenditure ₹20,000) - outside liabilities ₹2,50,000 = ₹7,00,000.');
  });

  it('keeps figures exact and rounds only to show them, to the paisa', () => {
    const v = value({ ...base, profits: [r(10000), r(10000), r(10001)], averaging: 'weighted', rate: 12 });
    expect(v.average).toEqual({ n: 1000050, d: 1 });
    expect(value({ ...base, profits: [r(10000), r(10000), r(10001)] }).average).toEqual({ n: 3000100, d: 3 });
    expect(show(v.average)).toBe('₹10,000.50');
    const third = value({ ...base, profits: [r(10000), r(10000), r(10001)] });
    expect(show(third.average)).toBe('₹10,000.33');
    expect(toPaise({ n: -5, d: 2 })).toBe(-3);
  });

  it('refuses figures it cannot value', () => {
    expect(problemOf({ ...base, profits: [r(1), r(1), r(1)], books: { ...base.books, outside: r(1000000) } })).toMatch(/capital employed/);
    expect(problemOf({ ...base, profits: [r(1), r(1), r(1)], rate: 0 })).toMatch(/rate/);
    expect(problemOf({ ...base, profits: [r(1), r(1), r(1)], purchase: 2.3 })).toMatch(/half/);
    expect(problemOf({ ...base, profits: [r(1), r(1), r(1)], adjustments: [{ kind: 'repairsCapitalised', year: 0, amount: r(100), rate: 10 }] })).toMatch(/last year/);
    expect(problemOf(EXAMPLES[0].inputs)).toBeNull();
  });
});

describe('made-up firms', () => {
  it('come out in whole rupees, with a super profit no more than one and a half times the normal profit', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const i = randomInputs(createRng(seed));
      expect(problemOf(i)).toBeNull();
      expect(fits(value(i))).toBe(true);
    }
  });
});

describe('the walk-through', () => {
  it('has a step for each correction and the steps the method needs', () => {
    const s0 = stepsOf(value(EXAMPLES[0].inputs));
    expect(s0.map((s) => s.kind)).toEqual(['books', 'adjust', 'adjust', 'adjust', 'average', 'remuneration', 'capital', 'normal', 'super', 'goodwill']);
    expect(s0[2].text).toContain('2022-23: ₹1,20,000 + ₹30,000 (abnormal loss added back) - ₹10,000 (closing stock overvalued) = ₹1,40,000.');
    expect(s0.at(-1)!.text).toContain('₹1,80,000');
    const s1 = stepsOf(value(EXAMPLES[1].inputs));
    expect(s1.map((s) => s.kind)).toEqual(['books', 'adjust', 'weights', 'average', 'capital', 'capitalised', 'goodwill']);
    const st = stageOf(s0, 3);
    expect(st.adjusted).toBe(2);
    expect(st.justAdjusted).toBe(1);
    expect(st.average).toBe(false);
    expect(stageOf(s0, s0.length).goodwill).toBe(true);
  });
});

describe('try it', () => {
  it('asks questions whose answer is the figure worked, with named slips that differ from it', () => {
    for (const kind of GW_ASK_KINDS) {
      for (let n = 0; n < 15; n++) {
        const ask = gwAsk(kind, askRng(3, kind, n));
        expect(ask.prompt.length).toBeGreaterThan(20);
        const a = ask.answer;
        if (a.type === 'number') {
          expect(a.value).toBeGreaterThan(0);
          expect(a.value % 100).toBe(0);
          expect(judge(a, { figure: a.value }).right).toBe(true);
          for (const m of a.mistakes) expect(m.value).not.toBe(a.value);
        } else {
          expect(a.options.some((o) => o.id === a.correct)).toBe(true);
          expect(a.options).toHaveLength(4);
          expect(judge(a, { choice: a.options.find((o) => o.id !== a.correct)!.id }).why).toBeTruthy();
        }
      }
    }
  });

  it('marks the super profit of the drawn firm', () => {
    const ask = gwAsk('super', askRng(5, 'super', 0));
    const v = value(ask.inputs);
    expect(ask.answer.type === 'number' && ask.answer.value).toBe(toPaise(v.superProfit));
  });
});
