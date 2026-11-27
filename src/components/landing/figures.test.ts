import { describe, expect, it } from 'vitest';
import {
  BALANCE_SHEET,
  BS_ASSETS,
  BS_LIABILITIES,
  CAPITAL,
  CASH_AT_END,
  CGST,
  CLOSING_STOCK,
  EQUATION_END,
  EQUATION_POSITIONS,
  EQUATION_STEPS,
  GROSS_PROFIT,
  INVOICE_TOTAL,
  JOURNAL,
  LIST_PRICE,
  NARRATION,
  NET_PROFIT,
  OPENING,
  SALARY,
  SGST,
  TAXABLE,
  TRADE_DISCOUNT,
  TRADING_TOTAL,
  TRIAL_BALANCE,
  TRIAL_CR,
  TRIAL_DR,
  amount,
  inWords,
  inr,
  total,
} from './figures';

describe('the scale of the opening', () => {
  it('is level after every transaction: assets = liabilities + capital', () => {
    for (const [i, p] of EQUATION_POSITIONS.entries()) {
      expect(total(p, 'assets'), EQUATION_STEPS[i].text).toBe(total(p, 'liabilities') + total(p, 'capital'));
    }
  });

  it('tips only when the assets change in total, and is levelled by the same amount on the other side', () => {
    for (const step of EQUATION_STEPS) {
      const first = step.first.reduce((n, m) => n + m.by, 0);
      const then = step.then.reduce((n, m) => n + m.by, 0);
      expect(step.first.every((m) => m.side === 'assets'), step.text).toBe(true);
      expect(step.then.every((m) => m.side !== 'assets'), step.text).toBe(true);
      expect(then, step.text).toBe(first);
    }
  });

  it('ends with the figures the page shows without motion', () => {
    expect(EQUATION_END.assets).toEqual([
      { item: 'Cash', amount: 590_000 },
      { item: 'Furniture', amount: 25_000 },
      { item: 'Stock', amount: 10_000 },
    ]);
    expect(total(EQUATION_END, 'assets')).toBe(625_000);
    expect(total(EQUATION_END, 'liabilities')).toBe(115_000);
    expect(total(EQUATION_END, 'capital')).toBe(510_000);
  });
});

describe('the sale followed through the books', () => {
  it('charges GST at 18% on the price after trade discount, split equally within the state', () => {
    expect(LIST_PRICE).toBe(50_000);
    expect(TRADE_DISCOUNT).toBe(5_000);
    expect(TAXABLE).toBe(45_000);
    expect(CGST).toBe(4_050);
    expect(SGST).toBe(4_050);
    expect(CGST + SGST).toBe(TAXABLE * 0.18);
    expect(INVOICE_TOTAL).toBe(53_100);
  });

  it('is journalised with equal debits and credits, the party taking the invoice total', () => {
    const dr = JOURNAL.filter((l) => l.side === 'Dr').reduce((n, l) => n + l.amount, 0);
    const cr = JOURNAL.filter((l) => l.side === 'Cr').reduce((n, l) => n + l.amount, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(INVOICE_TOTAL);
    expect(JOURNAL.find((l) => l.account === 'Sales A/c')?.amount).toBe(TAXABLE);
    expect(NARRATION).toContain('₹50,000');
  });

  it('gives a trial balance that agrees', () => {
    expect(TRIAL_DR).toBe(173_100);
    expect(TRIAL_CR).toBe(173_100);
    expect(TRIAL_BALANCE.filter((r) => r.sale).length).toBe(JOURNAL.length);
  });

  it('gives final accounts whose profit closes into a balance sheet that balances', () => {
    expect(CAPITAL).toBe(120_000);
    expect(CASH_AT_END).toBe(57_000);
    expect(GROSS_PROFIT).toBe(15_000);
    // Trading Account: opening stock and gross profit against sales and closing stock.
    expect(OPENING.stock + GROSS_PROFIT).toBe(TRADING_TOTAL);
    expect(TRADING_TOTAL).toBe(TAXABLE + CLOSING_STOCK);
    // Profit and Loss Account.
    expect(SALARY + NET_PROFIT).toBe(GROSS_PROFIT);
    expect(NET_PROFIT).toBe(12_000);
    expect(BALANCE_SHEET.liabilities.find((r) => r.label === 'Capital at the end')?.amount).toBe(CAPITAL + NET_PROFIT);
    expect(BS_LIABILITIES).toBe(140_100);
    expect(BS_ASSETS).toBe(140_100);
  });
});

describe('amounts as the page writes them', () => {
  it('use Indian grouping', () => {
    expect(amount(140_100)).toBe('1,40,100');
    expect(inr(500_000)).toBe('₹5,00,000');
    expect(inr(-5_000)).toBe('−₹5,000');
  });

  it('write an invoice total in words', () => {
    expect(inWords(INVOICE_TOTAL)).toBe('Rupees fifty-three thousand one hundred only');
    expect(inWords(1_40_100)).toBe('Rupees one lakh forty thousand one hundred only');
    expect(inWords(25_00_007)).toBe('Rupees twenty-five lakh seven only');
  });
});
