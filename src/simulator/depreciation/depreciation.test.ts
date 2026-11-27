import { describe, expect, it } from 'vitest';
import { rupees } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { EXAMPLES, randomInputs, randomSale } from './examples';
import { curveOf, otherMethod, problemOf, schedule, type DepInputs } from './schedule';
import { accountAsAt, balanceSheetLines, eventsOf, ledgerOf, periodComplete, standingAfter, total } from './story';
import { DEP_ASK_KINDS, depAsk } from './tryit';

const r = (n: number) => rupees(n);
const ex = (id: string) => EXAMPLES.find((e) => e.id === id)!.inputs;
const charges = (i: DepInputs) => schedule(i).rows.map((x) => x.charge / 100);
const closings = (i: DepInputs) => schedule(i).rows.map((x) => x.closing / 100);

const base: DepInputs = {
  asset: 'machinery', startYear: 2022, purchaseMonth: 0, price: r(100000), extra: 0,
  method: 'slm', slmBasis: 'rate', life: 5, scrap: 0, rate: 10, provision: false, years: 5, sale: null,
};

describe('the schedule of depreciation, worked by hand', () => {
  it('straight line by life: a part first year, full years after, the sale year up to the date of sale, a loss', () => {
    const i = ex('slm-provision-loss');
    const s = schedule(i);
    expect(s.cost).toBe(r(200000));
    expect(s.annual).toBe(r(36000));
    expect(charges(i)).toEqual([18000, 36000, 36000, 27000]);
    expect(closings(i)).toEqual([182000, 146000, 110000, 83000]);
    expect(s.rows.map((x) => x.months)).toEqual([6, 12, 12, 9]);
    expect(s.rows[0].from).toBe('1 October 2022');
    expect(s.rows[0].to).toBe('31 March 2023');
    expect(s.rows[3].to).toBe('1 January 2026');
    expect(s.rows[0].working).toBe('(₹2,00,000 - ₹20,000) / 5 years = ₹36,000 a year; for 6 months: ₹36,000 × 6/12 = ₹18,000.');
    expect(s.sale).toEqual({ date: '1 January 2026', price: r(75000), bookValue: r(83000), written: r(117000), result: r(-8000) });
  });

  it('written down value: the rate on the opening book value, part years at both ends, a profit', () => {
    const i = ex('wdv-asset-profit');
    expect(charges(i)).toEqual([75000, 85000, 34000]);
    expect(closings(i)).toEqual([425000, 340000, 306000]);
    const s = schedule(i);
    expect(s.rows[1].working).toBe('20% of the opening book value of ₹4,25,000 = ₹85,000.');
    expect(s.rows[2].working).toBe('20% of the opening book value of ₹3,40,000 × 6/12 = ₹34,000.');
    expect(s.sale?.result).toBe(r(14000));
  });

  it('at the same rate the first year is equal, and from the second the WDV charge is lower', () => {
    const slm = base;
    const wdv = { ...base, method: 'wdv' as const };
    expect(charges(slm)).toEqual([10000, 10000, 10000, 10000, 10000]);
    expect(charges(wdv)).toEqual([10000, 9000, 8100, 7290, 6561]);
    expect(closings(wdv).at(-1)).toBe(59049);
    expect(otherMethod(slm, 5).method).toBe('wdv');
    const back = otherMethod(wdv, 5);
    expect([back.method, back.slmBasis, back.rate]).toEqual(['slm', 'rate', 10]);
  });

  it('rounds to the nearest rupee: the same SLM charge every full year, the last year of the life taking what is left; WDV each year', () => {
    const thirds = { ...base, slmBasis: 'life' as const, life: 3, scrap: 0, years: 4 };
    expect(charges(thirds)).toEqual([33333, 33333, 33334, 0]);
    expect(closings(thirds).at(-2)).toBe(0);
    expect(schedule(thirds).rows[2].working).toContain('The life runs out this year, so the ₹33,334 still left above the nil value is charged');
    expect(schedule(thirds).rows[0].working).toContain('Charged: ₹33,333 (to the nearest rupee)');
    // Bought in October: half a year at each end, the same full-year figure between.
    const october = { ...thirds, purchaseMonth: 6, years: 4 };
    expect(charges(october)).toEqual([16667, 33333, 33333, 16667]);
    expect(closings(october).at(-1)).toBe(0);
    // A rate on cost that does not come out whole: the same figure each year, the tenth year taking the rest.
    const odd = { ...base, price: r(33333), years: 11 };
    expect(charges(odd)).toEqual([...Array(9).fill(3333), 3336, 0]);
    const quarter = { ...base, method: 'wdv' as const, rate: 25, years: 4 };
    expect(charges(quarter)).toEqual([25000, 18750, 14063, 10547]);
    expect(schedule(quarter).rows[2].working).toContain('₹14,062.50, charged as ₹14,063 (to the nearest rupee)');
  });

  it('straight line never goes below the scrap value', () => {
    const i: DepInputs = { ...base, price: r(120000), purchaseMonth: 6, slmBasis: 'life', life: 2, scrap: r(20000), years: 4 };
    expect(charges(i)).toEqual([25000, 50000, 25000, 0]);
    expect(closings(i)).toEqual([95000, 45000, 20000, 20000]);
    expect(schedule(i).rows[2].working).toContain('only ₹25,000 is left above the scrap value of ₹20,000');
    expect(schedule(i).rows[3].working).toContain('no depreciation');
  });

  it('a sale in the year of purchase charges only the months between', () => {
    const i: DepInputs = { ...base, purchaseMonth: 3, rate: 20, method: 'wdv', sale: { year: 0, month: 9, price: r(95000) } };
    const s = schedule(i);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].months).toBe(6);
    expect(s.rows[0].charge).toBe(r(10000));
    expect(s.sale?.result).toBe(r(5000));
  });

  it('refuses figures that cannot be followed', () => {
    expect(problemOf(base)).toBeNull();
    expect(problemOf({ ...base, price: 0 })).not.toBeNull();
    expect(problemOf({ ...base, slmBasis: 'life', scrap: r(100000) })).not.toBeNull();
    expect(problemOf({ ...base, rate: 0 })).not.toBeNull();
    expect(problemOf({ ...base, purchaseMonth: 6, sale: { year: 0, month: 6, price: r(1) } })).not.toBeNull();
    expect(problemOf({ ...base, sale: { year: 1, month: 0, price: r(1) } })).not.toBeNull();
  });

  it('draws the book value line from the cost through every period end', () => {
    const pts = curveOf(schedule(ex('slm-provision-loss')));
    expect(pts.map((p) => p.months)).toEqual([0, 6, 18, 30, 39]);
    expect(pts.map((p) => p.value / 100)).toEqual([200000, 182000, 146000, 110000, 83000]);
  });
});

describe('the accounts, as the board writes them', () => {
  it('with a provision: the asset at cost, the provision growing, and Asset Disposal A/c showing the loss', () => {
    const s = schedule(ex('slm-provision-loss'));
    const [asset, provision, depreciation, disposal] = ledgerOf(s);
    expect(asset.title).toBe('Machinery A/c');
    expect(asset.periods[0].dr).toMatchObject([{ particulars: 'To Bank A/c', amount: r(200000), note: '(₹1,80,000 + ₹20,000)' }]);
    expect(asset.periods[0].cr).toMatchObject([{ particulars: 'By Balance c/d', amount: r(200000), date: '31 March 2023' }]);
    expect(asset.periods[3].cr).toMatchObject([{ particulars: 'By Asset Disposal A/c', amount: r(200000), date: '1 January 2026' }]);
    expect(provision.periods[2].cr.map((x) => [x.particulars, x.amount / 100])).toEqual([['By Balance b/d', 54000], ['By Depreciation A/c', 36000]]);
    expect(provision.periods[2].dr.map((x) => [x.particulars, x.amount / 100])).toEqual([['To Balance c/d', 90000]]);
    expect(provision.periods[3].dr.map((x) => [x.particulars, x.amount / 100])).toEqual([['To Asset Disposal A/c', 117000]]);
    expect(depreciation.periods.map((p) => p.dr[0].particulars)).toEqual(Array(4).fill('To Provision for Depreciation A/c'));
    expect(depreciation.periods[0].cr[0].particulars).toBe('By Profit and Loss A/c');
    expect(disposal.title).toBe('Asset Disposal A/c');
    expect(disposal.periods[0].dr.map((x) => [x.particulars, x.amount / 100])).toEqual([['To Machinery A/c', 200000]]);
    expect(disposal.periods[0].cr.map((x) => [x.particulars, x.amount / 100])).toEqual([
      ['By Provision for Depreciation A/c', 117000],
      ['By Bank A/c', 75000],
      ['By Loss on Sale of Asset A/c', 8000],
    ]);
  });

  it('without a provision: the asset account falls each year and is closed by the sale with its profit', () => {
    const s = schedule(ex('wdv-asset-profit'));
    const accounts = ledgerOf(s);
    expect(accounts.map((a) => a.id)).toEqual(['asset', 'depreciation']);
    const sale = accounts[0].periods[2];
    expect(sale.dr.map((x) => [x.particulars, x.amount / 100])).toEqual([['To Balance b/d', 340000], ['To Profit on Sale of Asset A/c', 14000]]);
    expect(sale.cr.map((x) => [x.particulars, x.amount / 100])).toEqual([['By Depreciation A/c', 34000], ['By Bank A/c', 320000]]);
  });

  it('every period of every account agrees, for the examples and for made-up figures', () => {
    const rng = createRng(42);
    const all = [...EXAMPLES.map((e) => e.inputs)];
    for (let n = 0; n < 150; n++) all.push(n % 2 ? randomSale(rng) : { ...randomInputs(rng), years: 1 + (n % 10) });
    for (const i of all) {
      expect(problemOf(i), JSON.stringify(i)).toBeNull();
      const s = schedule(i);
      for (const a of ledgerOf(s)) for (const p of a.periods) expect(total(p.dr), `${a.title} ${p.title}`).toBe(total(p.cr));
      // The book value is the cost less what has been written off, and never below the scrap value.
      for (const row of s.rows) {
        expect(row.closing).toBe(s.cost - row.writtenAfter);
        expect(row.charge % 100).toBe(0);
        if (i.method === 'slm' && i.slmBasis === 'life') expect(row.closing).toBeGreaterThanOrEqual(i.scrap);
        expect(row.closing).toBeGreaterThanOrEqual(0);
      }
      if (s.sale) expect(s.sale.result).toBe(s.sale.price - (s.cost - s.sale.written));
      // The journal entries balance.
      for (const e of eventsOf(s)) for (const j of e.entries) {
        const sum = (side: 'Dr' | 'Cr') => j.lines.filter((l) => l.side === side).reduce((t, l) => t + l.amount, 0);
        expect(sum('Dr')).toBe(sum('Cr'));
      }
    }
  });

  it('shows an account as it stands after each event, with totals only once a period is complete', () => {
    const s = schedule(ex('slm-provision-loss'));
    const provision = ledgerOf(s)[1];
    expect(accountAsAt(provision, 1)).toEqual([]);
    const two = accountAsAt(provision, 2);
    // The year is closed and its balance brought down on 1 April: the next year's account has begun.
    expect(two.map((p) => [...p.dr, ...p.cr].map((x) => x.particulars))).toEqual([['To Balance c/d', 'By Depreciation A/c'], ['By Balance b/d']]);
    expect(periodComplete(provision.periods[0], 2)).toBe(true);
    expect(periodComplete(provision.periods[1], 2)).toBe(false);
    expect(accountAsAt(provision, 2)[0].dr[0].particulars).toBe('To Balance c/d');
    expect(accountAsAt(provision, 3)[1].cr.map((x) => x.particulars)).toEqual(['By Balance b/d', 'By Depreciation A/c']);
  });
});

describe('the story of the asset', () => {
  it('tells each event with its entries', () => {
    const s = schedule(ex('slm-provision-loss'));
    const ev = eventsOf(s);
    expect(ev.map((e) => e.kind)).toEqual(['buy', 'charge', 'charge', 'charge', 'charge', 'sale']);
    expect(ev[0].text).toContain('its cost is ₹1,80,000 + ₹20,000 = ₹2,00,000');
    expect(ev[1].text).toContain('6 months of use, from 1 October 2022');
    expect(ev[1].text).toContain('Machinery A/c stays at its cost of ₹2,00,000');
    expect(ev[4].text).toContain('first depreciated up to the date of sale, 9 months from 1 April 2025');
    expect(ev[5].text).toContain('book value ₹83,000 against the price of ₹75,000, a loss of ₹8,000');
    expect(ev[5].entries).toHaveLength(4);
    expect(ev[5].entries[3].lines).toEqual([
      { account: 'Loss on Sale of Asset A/c', side: 'Dr', amount: r(8000) },
      { account: 'Asset Disposal A/c', side: 'Cr', amount: r(8000) },
    ]);
    const wdv = eventsOf(schedule(ex('wdv-asset-profit')));
    expect(wdv[1].text).toContain('Vehicles A/c itself credited, so the account falls to the book value, ₹4,25,000');
    // Journalised as the asset account shows it: the whole price, then the profit transferred out.
    expect(wdv.at(-1)!.entries.map((e) => e.lines)).toEqual([
      [{ account: 'Bank A/c', side: 'Dr', amount: r(320000) }, { account: 'Vehicles A/c', side: 'Cr', amount: r(320000) }],
      [{ account: 'Vehicles A/c', side: 'Dr', amount: r(14000) }, { account: 'Profit on Sale of Asset A/c', side: 'Cr', amount: r(14000) }],
    ]);
    const loss = eventsOf(schedule({ ...ex('wdv-asset-profit'), sale: { year: 2, month: 6, price: r(300000) } })).at(-1)!;
    expect(loss.entries.map((e) => e.lines)).toEqual([
      [{ account: 'Bank A/c', side: 'Dr', amount: r(300000) }, { account: 'Vehicles A/c', side: 'Cr', amount: r(300000) }],
      [{ account: 'Loss on Sale of Asset A/c', side: 'Dr', amount: r(6000) }, { account: 'Vehicles A/c', side: 'Cr', amount: r(6000) }],
    ]);
  });

  it('knows where the asset stands after any event, and how the Balance Sheet shows it', () => {
    const s = schedule(ex('slm-provision-loss'));
    expect(standingAfter(s, 1)).toMatchObject({ assetAccount: r(200000), provision: 0, bookValue: r(200000) });
    expect(standingAfter(s, 3)).toMatchObject({ assetAccount: r(200000), provision: r(54000), bookValue: r(146000), lastCharge: r(36000), date: '31 March 2024' });
    expect(standingAfter(s, 6)).toMatchObject({ sold: true, bookValue: 0 });
    expect(balanceSheetLines(s, 3).map((l) => [l.label, l.amount / 100])).toEqual([
      ['Machinery (at cost)', 200000],
      ['Less: Provision for Depreciation', 54000],
      ['Book value', 146000],
    ]);
    const w = schedule(ex('wdv-asset-profit'));
    expect(standingAfter(w, 2)).toMatchObject({ assetAccount: r(425000), provision: 0, bookValue: r(425000) });
    expect(balanceSheetLines(w, 2)).toEqual([{ label: 'Vehicles', amount: r(425000), total: true }]);
  });
});

describe('try it', () => {
  it('asks every kind with one right answer, and named mistakes that differ from it', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = createRng(seed);
      for (const kind of DEP_ASK_KINDS) {
        const q = depAsk(kind, rng);
        const s = schedule(q.inputs);
        expect(q.reveal).toBeGreaterThan(q.shown);
        expect(q.reveal).toBeLessThanOrEqual(eventsOf(s).length);
        if (q.answer.type === 'number') {
          expect(q.answer.value).toBeGreaterThan(0);
          for (const m of q.answer.mistakes) expect(m.value).not.toBe(q.answer.value);
        } else {
          const texts = q.answer.options.map((o) => o.text);
          expect(new Set(texts).size).toBe(texts.length);
          expect(q.answer.options.filter((o) => o.id === (q.answer as { correct: string }).correct)).toHaveLength(1);
          for (const o of q.answer.options) if (o.id !== q.answer.correct) expect(o.why, `${kind} ${o.text}`).toBeTruthy();
        }
      }
    }
  });

  it('the answers are the schedule\'s figures', () => {
    const rng = createRng(5);
    const q = depAsk('next-charge', rng);
    const s = schedule(q.inputs);
    const row = s.rows[q.shown - 1];
    expect(q.answer).toMatchObject({ type: 'number', value: row.charge });
    const b = depAsk('book-value', rng);
    expect(b.answer).toMatchObject({ type: 'number', value: schedule(b.inputs).rows[b.shown - 1].closing });
    const sale = depAsk('sale-result', rng);
    const res = schedule(sale.inputs).sale!.result;
    const right = sale.answer.type === 'choice' ? sale.answer.options.find((o) => o.id === 'right')!.text : '';
    expect(right).toContain(res > 0 ? 'Profit of' : 'Loss of');
  });
});
