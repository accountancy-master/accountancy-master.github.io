'use client';

import { LINE_LABEL, linesOf, money, ratioDef, ratioOf, type LineId, type RatioFigures, type RatioId } from '@/simulator/ratios/model';

// The balance sheet and the statement of profit and loss in brief, with the sub-totals the ratios use. When a ratio
// is in focus, every figure that goes into it is marked TOP (its numerator) or BOTTOM (its denominator), in words and
// in colour; after a transaction, every figure that moved shows its change.

type Line = { line: LineId; kind?: 'sub' | 'total' | 'indent'; note?: string };
type Block = { title: string; lines: Line[] };

const BALANCE_SHEET: Block[] = [
  {
    title: 'Equity and liabilities',
    lines: [
      { line: 'shareCapital', kind: 'indent' },
      { line: 'reserves', kind: 'indent' },
      { line: 'shareholdersFunds', kind: 'sub' },
      { line: 'longTermBorrowings', kind: 'indent' },
      { line: 'longTermProvisions', kind: 'indent' },
      { line: 'nonCurrentLiabilities', kind: 'sub' },
      { line: 'shortTermBorrowings', kind: 'indent' },
      { line: 'tradePayables', kind: 'indent' },
      { line: 'otherCurrentLiabilities', kind: 'indent' },
      { line: 'shortTermProvisions', kind: 'indent' },
      { line: 'currentLiabilities', kind: 'sub' },
      { line: 'totalLiabilities', kind: 'total' },
    ],
  },
  {
    title: 'Assets',
    lines: [
      { line: 'ppe', kind: 'indent' },
      { line: 'nonCurrentInvestments', kind: 'indent' },
      { line: 'nonCurrentAssets', kind: 'sub' },
      { line: 'currentInvestments', kind: 'indent' },
      { line: 'inventories', kind: 'indent' },
      { line: 'tradeReceivables', kind: 'indent' },
      { line: 'cash', kind: 'indent' },
      { line: 'prepaidExpenses', kind: 'indent' },
      { line: 'currentAssets', kind: 'sub' },
      { line: 'totalAssets', kind: 'total' },
    ],
  },
];

const PROFIT_AND_LOSS: Block[] = [
  {
    title: 'For the year',
    lines: [
      { line: 'creditRevenue', kind: 'indent' },
      { line: 'cashRevenue', kind: 'indent' },
      { line: 'revenue', kind: 'sub' },
      { line: 'costOfRevenue' },
      { line: 'grossProfit', kind: 'sub' },
      { line: 'operatingExpenses', note: 'employee benefits, depreciation, other expenses' },
      { line: 'operatingProfit', kind: 'sub' },
      { line: 'otherIncome' },
      { line: 'pbit', kind: 'sub' },
      { line: 'financeCosts' },
      { line: 'pbt', kind: 'sub' },
      { line: 'tax' },
      { line: 'pat', kind: 'total' },
    ],
  },
  {
    title: 'Additional information',
    lines: [
      { line: 'openingInventories' },
      { line: 'openingTradeReceivables' },
      { line: 'openingTradePayables' },
      { line: 'cashPurchases' },
      { line: 'purchases', note: 'cost of revenue from operations + closing − opening inventories − purchases for cash; no direct expenses, every other purchase on credit' },
    ],
  },
];

/** Which lines go into the ratio's terms: +1 or −1 in the top, in the bottom. */
function tagsOf(id: RatioId | null, f: RatioFigures): Map<LineId, { where: 'top' | 'bottom'; sign: 1 | -1 }> {
  const out = new Map<LineId, { where: 'top' | 'bottom'; sign: 1 | -1 }>();
  if (!id) return out;
  const v = ratioOf(ratioDef(id), linesOf(f));
  for (const p of v.top.parts) out.set(p.line, { where: 'top', sign: p.sign });
  for (const p of v.bottom.parts) if (!out.has(p.line)) out.set(p.line, { where: 'bottom', sign: p.sign });
  return out;
}

export function Statements({ figures, before = null, focus, prefix }: { figures: RatioFigures; before?: RatioFigures | null; focus: RatioId | null; prefix: string }) {
  const l = linesOf(figures);
  const was = before ? linesOf(before) : null;
  const tags = tagsOf(focus, figures);
  const table = (title: string, blocks: Block[], testId: string) => (
    <div className="overflow-x-auto rounded-card border border-edge bg-surface p-3 shadow-card">
      <table className="w-full border-collapse text-sm" data-testid={`${prefix}-${testId}`}>
        <caption className="pb-1 text-left text-base font-extrabold">{title}</caption>
        {blocks.map((b) => (
          <tbody key={b.title}>
            <tr>
              <th colSpan={2} scope="rowgroup" className="pt-2 text-left text-xs font-extrabold uppercase tracking-wide text-muted">
                {b.title}
              </th>
            </tr>
            {b.lines.map((x) => {
              const tag = tags.get(x.line);
              const delta = was ? l[x.line] - was[x.line] : 0;
              const label = x.line === 'tax' ? `Tax at ${figures.taxRate}% of the profit before tax` : LINE_LABEL[x.line];
              return (
                <tr
                  key={x.line}
                  data-testid={`${prefix}-line-${x.line}`}
                  data-tag={tag?.where}
                  className={`${x.kind === 'sub' || x.kind === 'total' ? 'border-t border-edge font-extrabold' : ''} ${x.kind === 'total' ? 'border-b-4 border-double border-edge-deep' : ''} ${tag ? (tag.where === 'top' ? 'bg-hue-sky-soft' : 'bg-hue-amber-soft') : ''}`}
                >
                  <td className={`py-0.5 pr-2 ${x.kind === 'indent' ? 'pl-3' : ''}`}>
                    {tag ? (
                      <span className={`mr-1 rounded px-1 text-[0.65rem] font-extrabold ${tag.where === 'top' ? 'bg-surface text-hue-sky' : 'bg-surface text-hue-amber'}`}>
                        {tag.where === 'top' ? 'TOP' : 'BOTTOM'}
                        {tag.sign < 0 ? ' −' : ''}
                      </span>
                    ) : null}
                    {label}
                    {x.note ? <span className="block text-xs font-normal text-muted">({x.note})</span> : null}
                  </td>
                  <td className="py-0.5 text-right align-top tabular-nums">
                    <span className="block">{money(l[x.line])}</span>
                    {delta !== 0 ? (
                      <span className={`block text-xs font-extrabold ${delta > 0 ? 'text-primary-ink' : 'text-danger-deep'}`} data-testid={`${prefix}-delta-${x.line}`}>
                        {delta > 0 ? '▲ +' : '▼ −'}
                        {money(Math.abs(delta))}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
      {table(`Balance Sheet of ${figures.company} (in brief) at the end of the year`, BALANCE_SHEET, 'balance-sheet')}
      {table('Statement of Profit and Loss (in brief)', PROFIT_AND_LOSS, 'profit-and-loss')}
    </div>
  );
}
