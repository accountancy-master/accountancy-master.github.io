'use client';

import { formatINR, type Paise } from '@/engine/money';
import { affairsOf, endOf, profitStatement, startOf, yearOf, type AffairsRow, type Inputs } from '@/simulator/incomplete-records/model';
import type { Standing, StepId } from '@/simulator/incomplete-records/walk';
import { P } from './Picture';

// ---------------------------------------------------------------------------------------------------------------
// The board's formats beside the picture: the Statements of Affairs on the two dates in two columns (liabilities
// and capital, then assets), and the Statement of Profit or Loss, a deduction and a loss shown with a minus sign.
// A figure appears once the picture has reached it.
// ---------------------------------------------------------------------------------------------------------------

const fig = (p: Paise) => formatINR(p).slice(1);
const signed = (p: Paise) => (p < 0 ? `(−) ${fig(-p)}` : fig(p));
const TH = 'py-1 pr-2 text-left text-xs font-bold uppercase tracking-wide text-muted';
const THR = 'py-1 pl-2 text-right text-xs font-bold uppercase tracking-wide text-muted';

export function Statements({ i, st }: { i: Inputs; st: Standing }) {
  return (
    <div className="grid items-start gap-3 xl:grid-cols-2">
      <Affairs i={i} st={st} />
      <ProfitStatement i={i} st={st} />
    </div>
  );
}

function Affairs({ i, st }: { i: Inputs; st: Standing }) {
  const a = affairsOf(i);
  const seen = (col: 'open' | 'close', side: 'assets' | 'liabilities') => st.has(`${col}-${side}` as StepId);
  const cap = (col: 'open' | 'close') => st.has(`${col}-capital` as StepId);
  const cell = (r: AffairsRow, col: 'open' | 'close', side: 'assets' | 'liabilities') => {
    if (r.capital || (r.total && side === 'liabilities')) return cap(col) ? fig(r[col]) : '';
    if (r.total) return seen(col, side) ? fig(r[col]) : '';
    return seen(col, side) ? (r[col] ? fig(r[col]) : '') : '';
  };
  const table = (side: 'assets' | 'liabilities') => (
    <table data-testid={`${P}-affairs-${side}`} className="w-full border-collapse text-sm">
      <caption className="sr-only">{side === 'assets' ? 'Assets' : 'Liabilities and capital'}</caption>
      <thead>
        <tr className="border-b-2 border-edge-deep">
          <th scope="col" className={TH}>{side === 'assets' ? 'Assets' : 'Liabilities'}</th>
          <th scope="col" className={THR}>{startOf(i)} ₹</th>
          <th scope="col" className={THR}>{endOf(i)} ₹</th>
        </tr>
      </thead>
      <tbody>
        {a[side].map((r) => (
          <tr key={r.label + (r.total ? '-t' : '')} className={`align-top tabular-nums ${r.total ? 'border-y-2 border-edge-deep font-extrabold' : 'border-b border-edge'} ${r.capital ? 'font-bold text-hue-green' : ''}`}>
            <td className="py-1 pr-2">{r.label}</td>
            <td className="py-1 pl-2 text-right">{cell(r, 'open', side)}</td>
            <td className="py-1 pl-2 text-right">{cell(r, 'close', side)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <section aria-labelledby={`${P}-affairs-title`} className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id={`${P}-affairs-title`} className="text-center text-base font-extrabold">
        Statements of Affairs of {i.shop}
      </h3>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
        {table('liabilities')}
        {table('assets')}
      </div>
      <p className="text-xs text-muted">Capital is the balancing figure in each column. An item that is nil on a date is left blank; the proprietor&apos;s private assets and debts never appear.</p>
    </section>
  );
}

function ProfitStatement({ i, st }: { i: Inputs; st: Standing }) {
  const rows = profitStatement(i).filter((r) => st.has(r.step as StepId));
  return (
    <section aria-labelledby={`${P}-pl-title`} className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id={`${P}-pl-title`} className="text-center text-base font-extrabold">
        Statement of Profit or Loss of {i.shop} for the {yearOf(i)}
      </h3>
      {rows.length === 0 ? (
        <p className="text-center text-sm text-muted">It is written once both capitals are known.</p>
      ) : (
        <table data-testid={`${P}-profit-statement`} className="w-full border-collapse text-sm">
          <caption className="sr-only">Statement of Profit or Loss</caption>
          <thead>
            <tr className="border-b-2 border-edge-deep">
              <th scope="col" className={TH}>Particulars</th>
              <th scope="col" className={THR}>Amount ₹</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={`align-top tabular-nums ${r.subtotal ? 'border-y-2 border-edge-deep font-extrabold' : 'border-b border-edge'}`}>
                <td className="py-1 pr-2">
                  {r.label}
                  {r.details?.length ? <span className="block text-xs font-normal text-muted">{r.details.join('; ')}</span> : null}
                </td>
                <td className="py-1 pl-2 text-right">{signed(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
