import { describe, expect, it } from 'vitest';
import COURSE_11 from './cbse11';
import COURSE_12 from './cbse12';
import {
  balancesOf,
  bookDifferences,
  closingBalance,
  ledgerOf,
  lineOf,
  lowestBalance,
  partsTotal,
  percentChange,
  percentOf,
  round2,
  sideTotal,
  totals,
  voucherForm,
} from './figures';
import type { BankReconciliationWorked, BrsItem, CompanyAnalysisWorked, RatioId, SoleProprietorWorked, SpreadsheetWorked, StatementLine, VouchersWorked, WorkedOutline } from './types';

// Every figure the worked outlines of the project guides state, checked against what its inputs give: an examiner
// reading the page must find no figure that does not follow.

const worked = <K extends WorkedOutline['kind']>(kind: K): Extract<WorkedOutline, { kind: K }> => {
  const found = [...COURSE_11.options, ...COURSE_12.options].map((o) => o.worked).find((w) => w.kind === kind);
  if (!found) throw new Error(`no worked outline of kind ${kind}`);
  return found as Extract<WorkedOutline, { kind: K }>;
};

describe('the comprehensive project (Rangoli Garments)', () => {
  const w: SoleProprietorWorked = worked('sole-proprietor');
  const balances = balancesOf(w.journal);
  const balanceOf = (accounts: readonly string[]) => accounts.reduce((n, a) => n + Math.abs(balances.get(a) ?? Number.NaN), 0);

  it('has a balanced journal entry for every transaction, and cash never runs below nil', () => {
    for (const e of w.journal) {
      const t = totals(e.lines);
      expect(t.dr, e.narration).toBe(t.cr);
      expect(t.dr, e.narration).toBeGreaterThan(0);
      for (const l of e.lines) expect(Boolean(l.dr) !== Boolean(l.cr), `${e.narration}: ${l.account}`).toBe(true);
    }
    expect(lowestBalance(w.journal, 'Cash')).toBe(0);
    expect(lowestBalance(w.journal, 'Bank')).toBe(0);
    expect(w.journal.length).toBeGreaterThanOrEqual(20);
  });

  it('works out GST at 5%, half CGST and half SGST, on every sale and purchase', () => {
    for (const e of w.journal) {
      const base = e.lines.find((l) => ['Sales', 'Purchases', 'Sales Returns'].includes(l.account));
      const taxes = e.lines.filter((l) => /CGST|SGST/.test(l.account));
      if (!base || taxes.length === 0) continue;
      const amount = base.dr ?? base.cr ?? 0;
      for (const t of taxes) expect(t.dr ?? t.cr, e.narration).toBe(amount * 0.025);
    }
  });

  it('has a trial balance that is the ledger, and agrees', () => {
    const ledger = ledgerOf(w.journal).filter((a) => a.side !== null);
    expect(w.trialBalance.map((r) => r.account).sort()).toEqual(ledger.map((a) => a.name).sort());
    for (const r of w.trialBalance) {
      const b = balances.get(r.account)!;
      if (b > 0) expect(r.debit, r.account).toBe(b);
      else expect(r.credit, r.account).toBe(-b);
    }
    const dr = w.trialBalance.reduce((n, r) => n + (r.debit ?? 0), 0);
    const cr = w.trialBalance.reduce((n, r) => n + (r.credit ?? 0), 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(762750);
    // Every ledger account balances: its two sides come to the same total once the balance is carried down.
    for (const a of ledgerOf(w.journal)) expect(a.total).toBe(Math.max(a.debit.reduce((n, p) => n + p.amount, 0), a.credit.reduce((n, p) => n + p.amount, 0)));
  });

  const checkLines = (lines: readonly StatementLine[]) => {
    for (const l of lines) {
      if (l.parts) expect(partsTotal(l), l.label).toBe(l.amount);
      if (l.accounts) expect(balanceOf(l.accounts), l.label).toBe(l.amount);
      for (const p of l.parts ?? []) if (p.accounts) expect(balanceOf(p.accounts), `${l.label}: ${p.label}`).toBe(p.amount);
    }
  };

  it('takes every figure of the final accounts from the books, and every account of the trial balance once', () => {
    for (const lines of [w.trading.debit, w.trading.credit, w.profitAndLoss.debit, w.profitAndLoss.credit, w.balanceSheet.liabilities, w.balanceSheet.assets]) checkLines(lines);
    const used = [w.trading, w.profitAndLoss].flatMap((s) => [...s.debit, ...s.credit]).concat(w.balanceSheet.liabilities, w.balanceSheet.assets);
    const named = used.flatMap((l) => [...(l.accounts ?? []), ...(l.parts ?? []).flatMap((p) => p.accounts ?? [])]);
    expect([...named].sort()).toEqual(w.trialBalance.map((r) => r.account).sort());
  });

  it('agrees the Trading and the Profit and Loss Accounts, and balances the Balance Sheet', () => {
    const gp = w.trading.debit.find((l) => /Gross Profit/.test(l.label))!.amount;
    expect(sideTotal(w.trading.debit)).toBe(sideTotal(w.trading.credit));
    expect(w.trading.credit.find((l) => /Closing Stock/.test(l.label))!.amount).toBe(w.closingStock);
    expect(w.profitAndLoss.credit.find((l) => /Gross Profit/.test(l.label))!.amount).toBe(gp);
    expect(sideTotal(w.profitAndLoss.debit)).toBe(sideTotal(w.profitAndLoss.credit));
    const np = w.profitAndLoss.debit.find((l) => /Net Profit/.test(l.label))!.amount;
    const dep = w.depreciation.reduce((n, d) => n + d.amount, 0);
    expect(w.profitAndLoss.debit.find((l) => /Depreciation/.test(l.label))!.amount).toBe(dep);
    for (const d of w.depreciation) {
      const asset = w.balanceSheet.assets.find((l) => l.parts?.some((p) => p.accounts?.includes(d.account)))!;
      expect(asset.parts!.find((p) => p.less)!.amount, d.account).toBe(d.amount);
    }
    expect(w.balanceSheet.liabilities[0].parts!.find((p) => /Net profit/.test(p.label))!.amount).toBe(np);
    expect(w.balanceSheet.assets.find((l) => /Closing stock/.test(l.label))!.amount).toBe(w.closingStock);
    expect(sideTotal(w.balanceSheet.liabilities)).toBe(sideTotal(w.balanceSheet.assets));
    expect(w.keyFigures).toEqual({ grossProfit: gp, netProfit: np, balanceSheetTotal: sideTotal(w.balanceSheet.assets) });
    expect(w.keyFigures).toEqual({ grossProfit: 117000, netProfit: 63350, balanceSheetTotal: 516100 });
  });

  it('works the depreciation from the cost, the rate and one month', () => {
    expect(w.depreciation.map((d) => [d.account, d.amount])).toEqual([
      ['Furniture and Fittings', (84000 * 10) / 100 / 12],
      ['Computer', (45000 * 20) / 100 / 12],
    ]);
  });

  it('draws charts whose parts are the figures of the statements, largest first', () => {
    const [expenses, sales, assets, liabilities] = w.charts;
    const pl = w.profitAndLoss.debit.filter((l) => !/Net Profit/.test(l.label));
    expect(expenses.parts.reduce((n, p) => n + p.amount, 0)).toBe(sideTotal(pl));
    expect(expenses.parts.map((p) => p.amount).sort((a, b) => b - a)).toEqual(pl.map((l) => l.amount).sort((a, b) => b - a));
    const netSales = w.trading.credit[0].amount;
    expect(sales.parts.reduce((n, p) => n + p.amount, 0)).toBe(netSales);
    expect(sales.parts.find((p) => p.label === 'Net profit')!.amount).toBe(w.keyFigures.netProfit);
    expect(sales.parts.find((p) => p.label === 'Cost of goods sold')!.amount).toBe(netSales - w.keyFigures.grossProfit);
    expect(assets.parts.map((p) => p.amount).sort()).toEqual(w.balanceSheet.assets.map((l) => l.amount).sort());
    expect(liabilities.parts.map((p) => p.amount).sort()).toEqual(w.balanceSheet.liabilities.map((l) => l.amount).sort());
    for (const c of w.charts) {
      const amounts = c.parts.map((p) => p.amount);
      expect(amounts, c.title).toEqual([...amounts].sort((a, b) => b - a));
    }
  });
});

describe('the bank reconciliation project (Fresh Squeeze Juice Bar)', () => {
  const w: BankReconciliationWorked = worked('bank-reconciliation');
  const diffs = bookDifferences(w.cashBook, w.passBook);
  /** What the items say the pass book has over the cash book, ref by ref, with the sign they are given. */
  const claimed = (items: readonly BrsItem[], sign: 1 | -1, into: Map<string, number>) => {
    for (const item of items) {
      const actual = item.refs.reduce((n, r) => n + (diffs.get(r)!.bank - diffs.get(r)!.cash), 0);
      expect(actual, item.label).toBe(sign * item.amount);
      for (const r of item.refs) {
        expect(into.has(r), `${r} is counted twice`).toBe(false);
        into.set(r, sign);
      }
    }
  };
  const unmatched = [...diffs.entries()].filter(([, d]) => d.bank !== d.cash).map(([r]) => r).sort();

  it('has twenty to twenty-five transactions, and books that agreed at the start', () => {
    const refs = new Set([...w.cashBook, ...w.passBook].map((r) => r.ref).filter((r) => r !== 'opening'));
    expect(refs.size).toBeGreaterThanOrEqual(20);
    expect(refs.size).toBeLessThanOrEqual(25);
    expect(w.cashBook[0]).toMatchObject({ ref: 'opening' });
    expect(w.passBook[0]).toMatchObject({ ref: 'opening', deposit: w.cashBook[0].deposit });
    for (const book of [w.cashBook, w.passBook]) expect(book.map((r) => r.date)).toEqual([...book.map((r) => r.date)].sort());
  });

  it('starts at the cash book balance, ends at the pass book balance, and accounts for every difference once', () => {
    expect(w.statement.start.amount).toBe(closingBalance(w.cashBook));
    expect(w.statement.result.amount).toBe(closingBalance(w.passBook));
    const add = w.statement.add.reduce((n, i) => n + i.amount, 0);
    const less = w.statement.less.reduce((n, i) => n + i.amount, 0);
    expect(w.statement.start.amount + add - less).toBe(w.statement.result.amount);
    const seen = new Map<string, number>();
    claimed(w.statement.add, 1, seen);
    claimed(w.statement.less, -1, seen);
    expect([...seen.keys()].sort()).toEqual(unmatched);
    expect(w.statement).toMatchObject({ start: { amount: 81280, side: 'Dr' }, result: { amount: 76950, side: 'Cr' } });
  });

  it('amends the cash book for what only the bank knew, then reconciles what is left', () => {
    const a = w.amended;
    const sum = (items: readonly BrsItem[]) => items.reduce((n, i) => n + i.amount, 0);
    expect(w.statement.start.amount + sum(a.add) - sum(a.less)).toBe(a.balance.amount);
    expect(a.balance.amount + sum(a.add2) - sum(a.less2)).toBe(a.result.amount);
    expect(a.result.amount).toBe(closingBalance(w.passBook));
    const seen = new Map<string, number>();
    for (const [items, sign] of [[a.add, 1], [a.less, -1], [a.add2, 1], [a.less2, -1]] as const) claimed(items, sign, seen);
    expect([...seen.keys()].sort()).toEqual(unmatched);
    // What the cash book is amended for is only what the business had not recorded (or recorded wrongly): never a
    // cheque still on its way through the bank.
    for (const item of [...a.add, ...a.less]) for (const r of item.refs) expect(w.passBook.some((p) => p.ref === r), r).toBe(true);
    for (const item of [...a.add2, ...a.less2]) for (const r of item.refs) expect(w.passBook.some((p) => p.ref === r), r).toBe(false);
    expect(a.balance.amount).toBe(76600);
  });
});

describe('the vouchers project (Silai Point)', () => {
  const w: VouchersWorked = worked('vouchers');
  const journal = w.vouchers.map((v) => ({ date: v.date, lines: v.lines, narration: v.narration }));

  it('has balanced vouchers, each of the type its cash lines call for', () => {
    for (const v of w.vouchers) {
      const t = totals(v.lines);
      expect(t.dr, v.no).toBe(t.cr);
      const cashDr = v.lines.some((l) => l.account === 'Cash' && l.dr);
      const cashCr = v.lines.some((l) => l.account === 'Cash' && l.cr);
      if (v.type === 'debit') expect([cashDr, cashCr], v.no).toEqual([false, true]);
      if (v.type === 'credit') expect([cashDr, cashCr], v.no).toEqual([true, false]);
      if (v.type === 'transfer') expect(v.lines.some((l) => l.account === 'Cash' || l.account === 'Bank'), v.no).toBe(false);
      if (v.type === 'journal') expect(voucherForm(v), v.no).toBe('complex');
      expect(v.no.startsWith({ debit: 'D-', credit: 'C-', transfer: 'T-', journal: 'J-' }[v.type]), v.no).toBe(true);
    }
  });

  it('numbers the vouchers of each type in order, and has every type and form', () => {
    for (const prefix of ['D-', 'C-', 'T-', 'J-']) {
      const nos = w.vouchers.filter((v) => v.no.startsWith(prefix)).map((v) => Number(v.no.slice(2)));
      expect(nos).toEqual(nos.map((_, i) => i + 1));
    }
    expect(new Set(w.vouchers.map((v) => v.type))).toEqual(new Set(['debit', 'credit', 'transfer', 'journal']));
    expect(new Set(w.vouchers.map(voucherForm))).toEqual(new Set(['simple', 'compound', 'complex']));
    expect(w.vouchers.map((v) => v.date)).toEqual([...w.vouchers.map((v) => v.date)].sort());
  });

  it('keeps cash above nil and gives a trial balance that agrees', () => {
    expect(lowestBalance(journal, 'Cash')).toBe(0);
    const balances = [...balancesOf(journal).values()];
    const dr = balances.filter((b) => b > 0).reduce((n, b) => n + b, 0);
    const cr = -balances.filter((b) => b < 0).reduce((n, b) => n + b, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(193000);
    expect(balancesOf(journal).get('Cash')).toBe(27900);
  });
});

describe('the financial statement analysis (Sahyadri Agro Foods Ltd)', () => {
  const w: CompanyAnalysisWorked = worked('company-analysis');
  const bs = w.balanceSheet;
  const all = [...bs.equityAndLiabilities, ...bs.assets].map((g) => g.lines).concat([w.profitAndLoss.income, w.profitAndLoss.expenses, [w.profitAndLoss.tax], w.notes]);
  const v = (id: string, year: 'cy' | 'py') => lineOf(all, id)[year];
  const group = (groups: typeof bs.assets, head: string, year: 'cy' | 'py') => groups.find((g) => g.head === head)!.lines.reduce((n, l) => n + l[year], 0);

  /** Every figure the analysis needs, for one year. */
  function figures(year: 'cy' | 'py') {
    const total = bs.assets.flatMap((g) => g.lines).reduce((n, l) => n + l[year], 0);
    const equity = group(bs.equityAndLiabilities, 'Shareholders’ funds', year);
    const debt = group(bs.equityAndLiabilities, 'Non-current liabilities', year);
    const cl = group(bs.equityAndLiabilities, 'Current liabilities', year);
    const ca = group(bs.assets, 'Current assets', year);
    const revenue = v('revenue', year);
    const expenses = w.profitAndLoss.expenses.reduce((n, l) => n + l[year], 0);
    const pbt = revenue + v('other-income', year) - expenses;
    const pat = pbt - v('tax', year);
    const cogs = v('materials', year);
    const opex = v('employee', year) + v('depreciation', year) + v('other-expenses', year);
    const pbit = pbt + v('finance', year);
    return { total, equity, debt, cl, ca, revenue, expenses, pbt, pat, cogs, opex, pbit };
  }

  it('has balance sheets that balance, and a reserve that grew by the profit less the dividend', () => {
    for (const year of ['cy', 'py'] as const) {
      const liabilities = bs.equityAndLiabilities.flatMap((g) => g.lines).reduce((n, l) => n + l[year], 0);
      expect(liabilities, year).toBe(figures(year).total);
    }
    expect(v('other-equity', 'cy')).toBe(v('other-equity', 'py') + figures('cy').pat - v('dividend-paid', 'cy'));
    // The openings given for this year are last year's closings.
    expect(v('inventories-opening', 'cy')).toBe(v('inventories', 'py'));
    expect(v('receivables-opening', 'cy')).toBe(v('trade-receivables', 'py'));
    expect(figures('cy')).toMatchObject({ total: 4400, pbt: 800, pat: 600 });
    expect(figures('py')).toMatchObject({ total: 4000, pbt: 480, pat: 360 });
  });

  it('has a comparative statement whose every change and per cent follows from the two years', () => {
    for (const l of w.comparative.lines) {
      expect(l.change, l.label).toBe(l.cy - l.py);
      expect(l.percent, l.label).toBe(percentChange(l.cy, l.py));
    }
    const line = (label: string) => w.comparative.lines.find((l) => l.label === label)!;
    for (const year of ['cy', 'py'] as const) {
      const f = figures(year);
      expect(line('Revenue from operations')[year]).toBe(f.revenue);
      expect(line('Total income')[year]).toBe(f.revenue + v('other-income', year));
      expect(line('Total expenses')[year]).toBe(f.expenses);
      expect(line('Profit before tax')[year]).toBe(f.pbt);
      expect(line('Profit for the year')[year]).toBe(f.pat);
      for (const e of w.profitAndLoss.expenses) expect(line(e.label)[year], e.label).toBe(e[year]);
    }
  });

  it('has a common size balance sheet whose every per cent is of the total, with every line of the balance sheet', () => {
    for (const l of w.commonSize.lines) {
      expect(l.cyPercent, l.label).toBe(percentOf(l.cy, figures('cy').total));
      expect(l.pyPercent, l.label).toBe(percentOf(l.py, figures('py').total));
    }
    const line = (label: string) => w.commonSize.lines.find((l) => l.label === label)!;
    for (const g of [...bs.equityAndLiabilities, ...bs.assets]) {
      for (const l of g.lines) expect([line(l.label).cy, line(l.label).py], l.label).toEqual([l.cy, l.py]);
      expect([line(g.head).cy, line(g.head).py], g.head).toEqual([group([g], g.head, 'cy'), group([g], g.head, 'py')]);
    }
  });

  it('works every ratio from the statements, to two decimals', () => {
    const ratio = (id: RatioId, year: 'cy' | 'py'): number => {
      const f = figures(year);
      const avg = (a: string, b: string) => (v(a, year) + v(b, year)) / 2;
      const quick = f.ca - v('inventories', year) - v('other-ca', year);
      const r: Record<RatioId, number> = {
        current: f.ca / f.cl,
        quick: quick / f.cl,
        'debt-equity': f.debt / f.equity,
        'total-assets-to-debt': f.total / f.debt,
        proprietary: f.equity / f.total,
        'interest-coverage': f.pbit / v('finance', year),
        'inventory-turnover': f.cogs / avg('inventories', 'inventories-opening'),
        'receivables-turnover': f.revenue / avg('trade-receivables', 'receivables-opening'),
        'working-capital-turnover': f.revenue / (f.ca - f.cl),
        'gross-profit': ((f.revenue - f.cogs) / f.revenue) * 100,
        operating: ((f.cogs + f.opex) / f.revenue) * 100,
        'operating-profit': ((f.revenue - f.cogs - f.opex) / f.revenue) * 100,
        'net-profit': (f.pat / f.revenue) * 100,
        'return-on-investment': (f.pbit / (f.equity + f.debt)) * 100,
      };
      return round2(r[id]);
    };
    for (const r of w.ratios) {
      expect(r.cy, `${r.name} 2024-25`).toBe(ratio(r.id, 'cy'));
      expect(r.py, `${r.name} 2023-24`).toBe(ratio(r.id, 'py'));
    }
    expect(new Set(w.ratios.map((r) => r.group))).toEqual(new Set(['Liquidity', 'Solvency', 'Activity', 'Profitability']));
    const op = w.ratios.find((r) => r.id === 'operating')!;
    const opp = w.ratios.find((r) => r.id === 'operating-profit')!;
    expect(round2(op.cy + opp.cy)).toBe(100);
    expect(round2(op.py + opp.py)).toBe(100);
  });
});

describe('the Computerised Accounting practical file (Vriddhi Traders)', () => {
  const w: SpreadsheetWorked = worked('spreadsheet');
  it('works the payroll from the basic pay and the rates', () => {
    for (const p of w.payroll) {
      expect(p.da, p.name).toBe((p.basic * p.daPercent) / 100);
      expect(p.hra, p.name).toBe((p.basic * p.hraPercent) / 100);
      expect(p.gross, p.name).toBe(p.basic + p.da + p.hra);
      expect(p.pf, p.name).toBe((p.basic * p.pfPercent) / 100);
      expect(p.net, p.name).toBe(p.gross - p.pf);
    }
  });
  it('depreciates the van by the straight line method down to its scrap value', () => {
    const d = w.depreciation;
    const charge = (d.cost - d.scrap) / d.life;
    expect(d.rows).toHaveLength(d.life);
    d.rows.forEach((r, i) => {
      expect(r.opening).toBe(i === 0 ? d.cost : d.rows[i - 1].closing);
      expect(r.charge).toBe(charge);
      expect(r.closing).toBe(r.opening - r.charge);
    });
    expect(d.rows.at(-1)!.closing).toBe(d.scrap);
  });
});
