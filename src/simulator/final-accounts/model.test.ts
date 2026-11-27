import { describe, expect, it } from 'vitest';
import { rupees } from '@/engine/money';
import { ANANYA, KABIR, MEERA, newBusiness, READY } from './examples';
import {
  adjKey,
  badDebtsChargeOf,
  boughtOn,
  clampAdjustment,
  commissionIn,
  depreciationOf,
  discountOf,
  effectsOf,
  finalAccounts,
  fullState,
  partsOf,
  rowsOf,
  trialBalanceTotals,
  type Adjustment,
  type Business,
  type Row,
  type Side,
  type Statements,
} from './model';

const R = rupees;
const labels = (s: Side) => s.rows.map((r) => r.label);
const rowOf = (s: Side, label: string): Row => {
  const r = s.rows.find((x) => x.label === label);
  if (!r) throw new Error(`no row ${label} in ${labels(s).join(', ')}`);
  return r;
};
const stock = (b: Business) => b.adjustments.filter((a) => a.type === 'closingStock');

/** The things that must hold of any closed final accounts. */
function expectSound(st: Statements) {
  expect(st.trading.dr.total).toBe(st.trading.cr.total);
  expect(st.pl.dr.total).toBe(st.pl.cr.total);
  expect(st.bs.liabilities.total).toBe(st.bs.assets.total);
  for (const { row } of rowsOf(st)) {
    expect(row.amount, row.label).toBeGreaterThanOrEqual(0);
    expect(row.parts[0].sign, row.label).toBe(1);
  }
  // Every key on the page is unique, so that the screen can find each line.
  const keys = rowsOf(st).flatMap(({ row }) => row.parts.map((p) => p.key));
  expect(new Set(keys).size).toBe(keys.length);
}

describe('the ready businesses', () => {
  it('have trial balances that agree', () => {
    for (const b of READY) {
      const { dr, cr } = trialBalanceTotals(b);
      expect(dr, b.name).toBe(cr);
    }
    expect(trialBalanceTotals(MEERA).dr).toBe(R(598000));
  });
});

describe('Meera Textiles, worked by hand', () => {
  it('before the adjustments: gross profit ₹1,00,000, net profit ₹52,000, a Balance Sheet of ₹2,73,000', () => {
    const st = finalAccounts(MEERA, fullState(MEERA, stock(MEERA)));
    expectSound(st);
    // Trading: 40,000 + (2,10,000 − 10,000) + 18,000 + 7,000 = 2,65,000; (3,20,000 − 5,000) + 50,000 = 3,65,000.
    expect(labels(st.trading.dr)).toEqual(['Opening Stock', 'Purchases', 'Wages', 'Carriage Inwards', 'Gross Profit c/d']);
    expect(rowOf(st.trading.dr, 'Purchases').amount).toBe(R(200000));
    expect(rowOf(st.trading.cr, 'Sales').amount).toBe(R(315000));
    expect(st.gross).toBe(R(100000));
    expect(st.trading.cr.total).toBe(R(365000));
    // P&L: 36,000 + 24,000 + 6,000 + 2,000 = 68,000 against 1,00,000 + 8,000 + 12,000 = 1,20,000.
    expect(labels(st.pl.cr)).toEqual(['Gross Profit b/d', 'Commission Received', 'Rent Received']);
    expect(st.net).toBe(R(52000));
    // Capital 2,00,000 + 52,000 − 24,000 = 2,28,000; + creditors 45,000 = 2,73,000.
    expect(st.capital).toBe(R(228000));
    expect(st.bs.liabilities.total).toBe(R(273000));
    expect(rowOf(st.bs.assets, 'Sundry Debtors').amount).toBe(R(57000));
    // The order of permanence: fixed assets first, cash last; capital first.
    expect(labels(st.bs.assets)).toEqual(['Machinery', 'Furniture', 'Closing Stock', 'Sundry Debtors', 'Cash at Bank', 'Cash in Hand']);
    expect(labels(st.bs.liabilities)).toEqual(['Capital', 'Sundry Creditors']);
  });

  it('after all ten adjustments: gross profit ₹1,09,000, net profit ₹31,500, a Balance Sheet of ₹2,71,650', () => {
    const st = finalAccounts(MEERA, fullState(MEERA, MEERA.adjustments));
    expectSound(st);
    // Purchases 2,10,000 − return 10,000 − goods taken 3,000 − goods lost by fire 6,000 = 1,91,000.
    expect(rowOf(st.trading.dr, 'Purchases').amount).toBe(R(191000));
    expect(rowOf(st.trading.dr, 'Purchases').parts.map((p) => p.text)).toEqual(['Purchases', 'Less: Purchases Return', 'Less: Goods taken for personal use', 'Less: Goods lost by fire']);
    // 3,65,000 − (40,000 + 1,91,000 + 18,000 + 7,000) = 1,09,000.
    expect(st.gross).toBe(R(109000));
    expect(rowOf(st.pl.dr, 'Salaries').amount).toBe(R(40000));
    expect(rowOf(st.pl.dr, 'Insurance').amount).toBe(R(4500));
    // Bad debts 2,000 + further 1,000 + 5% of 59,000 (2,950) − old 3,000 = 2,950.
    expect(rowOf(st.pl.dr, 'Bad Debts').amount).toBe(R(2950));
    expect(rowOf(st.pl.dr, 'Bad Debts').parts.map((p) => p.text)).toEqual([
      'Bad Debts',
      'Add: Further Bad Debts',
      'Add: New Provision for Doubtful Debts',
      'Less: Old Provision for Doubtful Debts',
    ]);
    expect(rowOf(st.pl.dr, 'Depreciation on Machinery').amount).toBe(R(8000));
    expect(rowOf(st.pl.dr, 'Interest on Capital').amount).toBe(R(12000));
    // Goods lost 6,000 less the claim admitted 4,000.
    expect(rowOf(st.pl.dr, 'Loss by Fire').amount).toBe(R(2000));
    expect(rowOf(st.pl.cr, 'Commission Received').amount).toBe(R(10100));
    expect(rowOf(st.pl.cr, 'Rent Received').amount).toBe(R(9000));
    expect(labels(st.pl.cr)).not.toContain('Interest on Drawings');
    // Before the commission: 1,28,100 − 93,450 = 34,650; on the profit after charging it, 34,650 × 10/110 = 3,150.
    expect(st.commission).toEqual({ profit: R(34650), amount: R(3150) });
    expect(labels(st.pl.dr).slice(-2)).toEqual(["Manager's Commission", 'Net Profit transferred to Capital A/c']);
    expect(st.net).toBe(R(31500));
    // Check: 10% of the net profit after the commission is the commission.
    expect(st.net! / 10).toBe(R(3150));
    // Capital 2,00,000 + 12,000 + 31,500 − 24,000 − 3,000 = 2,16,500.
    expect(st.capital).toBe(R(216500));
    expect(rowOf(st.bs.liabilities, 'Capital').parts.map((p) => p.text)).toEqual(['Capital', 'Add: Interest on Capital', 'Add: Net Profit', 'Less: Drawings', 'Less: Goods taken for personal use']);
    expect(labels(st.bs.liabilities)).toEqual(['Capital', 'Sundry Creditors', 'Outstanding Salaries', 'Rent Received in Advance', "Outstanding Manager's Commission"]);
    expect(labels(st.bs.assets)).toEqual([
      'Machinery',
      'Furniture',
      'Prepaid Insurance',
      'Accrued Commission',
      'Closing Stock',
      'Sundry Debtors',
      'Insurance Claim Receivable',
      'Cash at Bank',
      'Cash in Hand',
    ]);
    expect(rowOf(st.bs.assets, 'Machinery').amount).toBe(R(72000));
    expect(rowOf(st.bs.assets, 'Sundry Debtors').amount).toBe(R(56050));
    expect(rowOf(st.bs.assets, 'Insurance Claim Receivable').amount).toBe(R(4000));
    expect(st.bs.assets.total).toBe(R(271650));
  });

  it('keeps the Balance Sheet in agreement after every single adjustment, alone or added one by one', () => {
    let applied: Adjustment[] = [];
    for (const a of MEERA.adjustments) {
      applied = [...applied, a];
      expectSound(finalAccounts(MEERA, fullState(MEERA, applied)));
      expectSound(finalAccounts(MEERA, fullState(MEERA, [a])));
    }
  });

  it('moves the old provision from the debtors to the charge for bad debts', () => {
    const before = partsOf(finalAccounts(MEERA, fullState(MEERA, stock(MEERA))));
    expect(before.get('bs:debtors:provision')?.source).toBe('tb:provision');
    const after = partsOf(finalAccounts(MEERA, fullState(MEERA, [...stock(MEERA), { type: 'badDebts', further: R(1000), rate: 5 }])));
    expect(after.has('bs:debtors:provision')).toBe(false);
    expect(after.get('pl:badDebts:old')?.source).toBe('tb:provision');
    expect(after.get('bs:debtors:provision:new')?.amount).toBe(R(2950));
  });

  it('gives each adjustment two effects, the result of the year first; a loss by fire with a claim has three', () => {
    for (const a of MEERA.adjustments) {
      const effects = effectsOf(MEERA, a);
      expect(effects.length, adjKey(a)).toBe(a.type === 'abnormalLoss' ? 3 : 2);
      expect(effects[0].spot.startsWith('bs'), adjKey(a)).toBe(false);
      expect(effects.at(-1)!.spot.startsWith('bs'), adjKey(a)).toBe(true);
    }
    expect(effectsOf(MEERA, { type: 'abnormalLoss', amount: R(6000), claim: R(4000) }).map((e) => e.spot)).toEqual(['trading-dr', 'pl-dr', 'bs-assets']);
    expect(effectsOf(MEERA, { type: 'commission', rate: 10, basis: 'after' })[0].text).toBe("To Manager's Commission ₹3,150");
    // Goods given away touch the two accounts only.
    expect(effectsOf(KABIR, { type: 'goodsGiven', to: 'samples', amount: R(1500) }).map((e) => e.spot)).toEqual(['trading-dr', 'pl-dr']);
  });
});

describe('a hard year (Kabir Electricals): losses on the other side, and an overdraft', () => {
  it('closes the Trading Account with a gross loss and the Profit and Loss Account with a net loss', () => {
    const st = finalAccounts(KABIR, fullState(KABIR, stock(KABIR)));
    expectSound(st);
    // Debit 60,000 + 2,40,000 + 20,000 + 5,000 = 3,25,000; credit 3,00,000 + 20,000 = 3,20,000.
    expect(st.gross).toBe(R(-5000));
    expect(labels(st.trading.cr)).toEqual(['Sales', 'Closing Stock', 'Gross Loss c/d']);
    expect(labels(st.pl.dr)[0]).toBe('Gross Loss b/d');
    // 5,000 + 36,000 + 18,000 + 9,000 + 3,000 = 71,000 against 6,000.
    expect(st.net).toBe(R(-65000));
    expect(labels(st.pl.cr)).toEqual(['Commission Received', 'Net Loss transferred to Capital A/c']);
    expect(rowOf(st.bs.liabilities, 'Capital').parts.map((p) => p.text)).toEqual(['Capital', 'Less: Net Loss', 'Less: Drawings']);
    expect(st.capital).toBe(R(165000));
    expect(labels(st.bs.liabilities)).toEqual(['Capital', 'Sundry Creditors', 'Bank Overdraft']);
    expect(st.bs.assets.total).toBe(R(236000));
  });

  it('after its adjustments: an outstanding direct expense deepens the gross loss, goods taken and samples lighten it', () => {
    const st = finalAccounts(KABIR, fullState(KABIR, KABIR.adjustments));
    expectSound(st);
    expect(rowOf(st.trading.dr, 'Wages').amount).toBe(R(22000));
    // 2,40,000 − goods taken 2,000 − free samples 1,500.
    expect(rowOf(st.trading.dr, 'Purchases').amount).toBe(R(236500));
    // 3,20,000 − (60,000 + 2,36,500 + 22,000 + 5,000) = −3,500.
    expect(st.gross).toBe(R(-3500));
    // The samples are added to the advertisement of the trial balance.
    expect(rowOf(st.pl.dr, 'Advertisement').parts.map((p) => `${p.text} ${p.amount / 100}`)).toEqual(['Advertisement 9000', 'Add: Free samples 1500']);
    // Net loss 65,000 + 2,000 − 1,000 (prepaid) − 1,000 (accrued) + 12,000 (depreciation) − 2,000 (goods taken) = 75,000; the samples change nothing.
    expect(st.net).toBe(R(-75000));
    expect(labels(st.bs.liabilities)).toEqual(['Capital', 'Sundry Creditors', 'Bank Overdraft', 'Outstanding Wages']);
    expect(st.capital).toBe(R(153000));
    expect(st.bs.assets.total).toBe(R(226000));
  });
});

describe('Ananya Stationers: a loan, bills, a sales return', () => {
  it('works out to a net profit of ₹7,859 after its adjustments', () => {
    const st = finalAccounts(ANANYA, fullState(ANANYA, ANANYA.adjustments));
    expectSound(st);
    // Trading: 25,000 + (1,60,000 − staff welfare 1,000 − fire 4,000) + 4,000 = 1,84,000; 2,36,000 + 35,000 = 2,71,000.
    expect(st.gross).toBe(R(87000));
    // Debtors 40,000 − 1,000 − 1,950 = 37,050; provision for discount 2% = 741.
    expect(rowOf(st.pl.dr, 'Provision for Discount on Debtors').amount).toBe(R(741));
    expect(rowOf(st.pl.dr, 'Staff Welfare Expenses').amount).toBe(R(1000));
    // Not insured: the whole cost is the loss.
    expect(rowOf(st.pl.dr, 'Loss by Fire').parts).toHaveLength(1);
    expect(rowOf(st.pl.dr, 'Loss by Fire').amount).toBe(R(4000));
    // Dr 30,000 + 19,500 + 2,700 + 6,000 + 3,000 + 1,000 + 1,950 + 741 + 3,000 + 9,750 + 4,000 = 81,641; Cr 87,000 + 2,500.
    expect(st.net).toBe(R(7859));
    expect(rowOf(st.bs.assets, 'Sundry Debtors').parts.map((p) => p.text)).toEqual([
      'Sundry Debtors',
      'Less: Further Bad Debts',
      'Less: Provision for Doubtful Debts',
      'Less: Provision for Discount',
    ]);
    expect(rowOf(st.bs.assets, 'Sundry Debtors').amount).toBe(R(36309));
    expect(st.bs.assets.total).toBe(R(286109));
    expect(labels(st.bs.liabilities)).toEqual(['Capital', 'Bank Loan', 'Sundry Creditors', 'Bills Payable', 'Outstanding Rent']);
    expect(labels(st.bs.assets)).toEqual(['Land and Building', 'Furniture', 'Prepaid Insurance', 'Accrued Interest', 'Closing Stock', 'Sundry Debtors', 'Bills Receivable', 'Cash at Bank', 'Cash in Hand']);
  });
});

describe('the figures worked out by a rate', () => {
  const odd: Business = { ...MEERA, tb: MEERA.tb.map((l) => (l.id === 'machinery' ? { ...l, amount: R(55555) } : l.id === 'capital' ? { ...l, amount: l.amount - R(24445) } : l)) };

  it('are rounded to the nearest rupee', () => {
    expect(trialBalanceTotals(odd).dr).toBe(trialBalanceTotals(odd).cr);
    // 55,555 × 10% = 5,555.50 → ₹5,556; × 15% = 8,333.25 → ₹8,333.
    expect(depreciationOf(odd, { item: 'machinery', rate: 10, months: 12 })).toBe(R(5556));
    expect(depreciationOf(odd, { item: 'machinery', rate: 15, months: 12 })).toBe(R(8333));
    expectSound(finalAccounts(odd, fullState(odd, [...stock(odd), { type: 'depreciation', item: 'machinery', rate: 15, months: 12 }])));
  });

  it('take a part of the year: depreciation for 6 months on an asset bought on 1 October 2025', () => {
    expect(depreciationOf(MEERA, { item: 'machinery', rate: 10, months: 6 })).toBe(R(4000));
    expect(boughtOn(6)).toBe('1 October 2025');
    expect(boughtOn(9)).toBe('1 July 2025');
    expect(boughtOn(3)).toBe('1 January 2026');
  });

  it('write back an old provision that is more than enough, on the credit side', () => {
    const a: Adjustment = { type: 'badDebts', further: 0, rate: 1 };
    // 2,000 + 0 + 1% of 60,000 (600) − 3,000 = −400: ₹400 written back.
    expect(badDebtsChargeOf(MEERA, a)).toBe(R(-400));
    const st = finalAccounts(MEERA, fullState(MEERA, [...stock(MEERA), a]));
    expectSound(st);
    const row = rowOf(st.pl.cr, 'Old Provision for Doubtful Debts');
    expect(row.amount).toBe(R(400));
    expect(row.parts.map((p) => p.text)).toEqual(['Old Provision for Doubtful Debts', 'Less: Bad Debts', 'Less: New Provision for Doubtful Debts']);
    expect(st.net).toBe(R(52000 + 2000 + 400));
  });

  it('keep an adjustment within what the books allow', () => {
    expect(clampAdjustment(MEERA, { type: 'prepaid', item: 'insurance', amount: R(9000) })).toEqual({ type: 'prepaid', item: 'insurance', amount: R(6000) });
    expect(clampAdjustment(MEERA, { type: 'goodsTaken', amount: -500 })).toEqual({ type: 'goodsTaken', amount: 0 });
    expect(clampAdjustment(MEERA, { type: 'depreciation', item: 'machinery', rate: 150, months: 20 })).toEqual({ type: 'depreciation', item: 'machinery', rate: 100, months: 12 });
  });
});

describe('the adjustments added for the 2025-26 list', () => {
  const cs = (b: Business) => stock(b);

  it("work out the manager's commission on either basis, after every other adjustment, and none on a loss", () => {
    const after: Adjustment = { type: 'commission', rate: 10, basis: 'after' };
    const before: Adjustment = { type: 'commission', rate: 10, basis: 'before' };
    // With the closing stock only, the net profit before the commission is 52,000.
    expect(commissionIn(MEERA, before, cs(MEERA))).toEqual({ profit: R(52000), amount: R(5200) });
    // 52,000 × 10/110 = 4,727.27: ₹4,727 to the nearest rupee.
    expect(commissionIn(MEERA, after, cs(MEERA))).toEqual({ profit: R(52000), amount: R(4727) });
    const st = finalAccounts(MEERA, fullState(MEERA, [...cs(MEERA), before]));
    expectSound(st);
    expect(st.net).toBe(R(46800));
    // Made before the others, it still waits for them: it is on the profit after all of them.
    const early = finalAccounts(MEERA, fullState(MEERA, [MEERA.adjustments.at(-1)!, ...MEERA.adjustments.slice(0, -1)]));
    expect(early.commission?.amount).toBe(R(3150));
    // A net loss: no commission, and no row.
    const loss = finalAccounts(KABIR, fullState(KABIR, [...cs(KABIR), after]));
    expectSound(loss);
    expect(loss.commission?.amount).toBe(0);
    expect(labels(loss.pl.dr)).not.toContain("Manager's Commission");
  });

  it('put a loss by fire wholly covered by insurance in the Trading Account and the Balance Sheet only', () => {
    const fire: Adjustment = { type: 'abnormalLoss', amount: R(5000), claim: R(5000) };
    const st = finalAccounts(MEERA, fullState(MEERA, [...cs(MEERA), fire]));
    expectSound(st);
    expect(st.gross).toBe(R(105000));
    expect(labels(st.pl.dr)).not.toContain('Loss by Fire');
    expect(st.net).toBe(R(57000));
    expect(effectsOf(MEERA, fire).map((e) => e.spot)).toEqual(['trading-dr', 'bs-assets']);
    expect(clampAdjustment(MEERA, { type: 'abnormalLoss', amount: R(5000), claim: R(9000) })).toEqual(fire);
  });

  it('show free samples as a row of their own when the trial balance has no advertisement, and leave the net profit alone', () => {
    const samples: Adjustment = { type: 'goodsGiven', to: 'samples', amount: R(2000) };
    const st = finalAccounts(MEERA, fullState(MEERA, [...cs(MEERA), samples]));
    expectSound(st);
    expect(st.gross).toBe(R(102000));
    expect(rowOf(st.pl.dr, 'Advertisement (free samples)').amount).toBe(R(2000));
    expect(st.net).toBe(R(52000));
  });

  it('make the provision for discount on the debtors less the old provision when no new one is made', () => {
    const d: Adjustment = { type: 'discount', rate: 2 };
    // 60,000 − old provision 3,000 = 57,000; 2% = 1,140.
    expect(discountOf(MEERA, d, [...cs(MEERA), d])).toBe(R(1140));
    // After further bad debts 1,000 and 5% (2,950): 56,050 × 2% = 1,121.
    expect(discountOf(MEERA, d, MEERA.adjustments)).toBe(R(1121));
    const st = finalAccounts(MEERA, fullState(MEERA, [...MEERA.adjustments.slice(0, -1), d, MEERA.adjustments.at(-1)!]));
    expectSound(st);
    expect(rowOf(st.bs.assets, 'Sundry Debtors').amount).toBe(R(56050 - 1121));
  });
});

describe('a state part of the way', () => {
  it('shows only what is placed, and closes nothing until asked', () => {
    const st = finalAccounts(MEERA, { placed: new Set(['purchases', 'sales']), adjustments: [], closeTrading: false, closePL: false });
    expect(labels(st.trading.dr)).toEqual(['Purchases']);
    expect(rowOf(st.trading.dr, 'Purchases').parts).toHaveLength(1);
    expect(st.gross).toBeNull();
    expect(st.pl.dr.rows).toHaveLength(0);
    expect(st.bs.liabilities.rows).toHaveLength(0);
  });
});

describe('new businesses from a seed', () => {
  it('always agree, end in a profit, and come to whole rupees', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const b = newBusiness(seed);
      expect(newBusiness(seed)).toEqual(b);
      const { dr, cr } = trialBalanceTotals(b);
      expect(dr, `${seed}`).toBe(cr);
      const st = finalAccounts(b, fullState(b, b.adjustments));
      expectSound(st);
      expect(st.net!, `${seed}`).toBeGreaterThan(0);
      for (const { row } of rowsOf(st)) for (const p of row.parts) expect(p.amount % 100, `${seed} ${p.key}`).toBe(0);
      let applied: Adjustment[] = [];
      for (const a of b.adjustments) {
        applied = [...applied, a];
        expectSound(finalAccounts(b, fullState(b, applied)));
      }
    }
  });

  it('sometimes have a bank overdraft, a balance on the other side', () => {
    const seeds = Array.from({ length: 60 }, (_, i) => newBusiness(i + 1));
    expect(seeds.some((b) => b.tb.some((l) => l.id === 'bankOverdraft'))).toBe(true);
    expect(seeds.some((b) => b.tb.some((l) => l.id === 'bank'))).toBe(true);
  });
});
