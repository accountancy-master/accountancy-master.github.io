'use client';

import { formatINR } from '@/engine/money';
import type { Scenario, SoFar, StatementLine } from '@/simulator/bank-reconciliation/books';
import { closingDate } from '@/simulator/bank-reconciliation/books';

// The Bank Reconciliation Statement as the board sets it out, in either of its two accepted layouts: Add and Less
// with an inner and an outer amount column, or a Plus column and a Minus column.

export type Layout = 'addless' | 'plusminus';

const figure = (p: number) => formatINR(p).slice(1);
const sum = (xs: readonly StatementLine[]) => xs.reduce((t, l) => t + l.item.amount, 0);

export function StatementView({ s, st, layout, letter, lit }: { s: Scenario; st: SoFar; layout: Layout; letter: Map<string, string>; lit: ReadonlySet<string> }) {
  const row = (l: StatementLine) => (lit.has(l.item.id) ? 'bg-primary-soft' : '');
  const tag = (l: StatementLine) => <span className="mr-1 inline-block rounded bg-surface px-1 text-xs font-extrabold ring-1 ring-edge-deep">{letter.get(l.item.id)}</span>;
  const empty = st.adds.length + st.lesses.length === 0;
  return (
    <section aria-labelledby="brs-statement-title" data-testid="lab-bank-reconciliation-statement" data-complete={st.complete ? 'true' : 'false'} className="flex flex-col gap-2 rounded-card border-2 border-primary/40 bg-surface p-3 shadow-card">
      <h3 id="brs-statement-title" className="text-center text-base font-extrabold">
        Bank Reconciliation Statement of {s.firm} as on {closingDate(s)}
      </h3>
      {layout === 'addless' ? (
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b-2 border-edge-deep text-left text-muted">
              <th scope="col" className="py-1 pr-1 font-bold">
                Particulars
              </th>
              <th scope="col" className="w-20 py-1 pr-1 text-right font-bold">
                ₹
              </th>
              <th scope="col" className="w-20 py-1 text-right font-bold">
                ₹
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr className="border-b border-edge font-bold">
              <td className="py-1 pr-1">{st.startLabel}</td>
              <td />
              <td className="py-1 text-right">{figure(Math.abs(st.start))}</td>
            </tr>
            {st.adds.map((l, i) => (
              <tr key={l.item.id} data-testid="lab-bank-reconciliation-statement-add" className={`align-top ${row(l)}`}>
                <td className="py-1 pr-1">
                  {i === 0 ? <span className="font-extrabold">Add: </span> : null}
                  {tag(l)}
                  {l.facts.line}
                </td>
                <td className="py-1 pr-1 text-right">{figure(l.item.amount)}</td>
                <td className="py-1 text-right">{i === st.adds.length - 1 ? figure(sum(st.adds)) : ''}</td>
              </tr>
            ))}
            {st.adds.length > 0 ? (
              <tr className="border-y border-edge">
                <td />
                <td />
                <td className="py-1 text-right font-bold">{figure(st.afterAdds)}</td>
              </tr>
            ) : null}
            {st.lesses.map((l, i) => (
              <tr key={l.item.id} data-testid="lab-bank-reconciliation-statement-less" className={`align-top ${row(l)}`}>
                <td className="py-1 pr-1">
                  {i === 0 ? <span className="font-extrabold">Less: </span> : null}
                  {tag(l)}
                  {l.facts.line}
                </td>
                <td className="py-1 pr-1 text-right">{figure(l.item.amount)}</td>
                <td className="py-1 text-right">{i === st.lesses.length - 1 ? `(${figure(sum(st.lesses))})` : ''}</td>
              </tr>
            ))}
            <tr className={`border-y-2 border-edge-deep font-extrabold ${st.complete ? '' : 'text-muted'}`}>
              <td data-testid="lab-bank-reconciliation-statement-end-label" className="py-1 pr-1">
                {st.endLabel}
              </td>
              <td />
              <td data-testid="lab-bank-reconciliation-statement-end" className="py-1 text-right">
                {figure(Math.abs(st.end))}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b-2 border-edge-deep text-left text-muted">
              <th scope="col" className="py-1 pr-1 font-bold">
                Particulars
              </th>
              <th scope="col" className="w-20 py-1 pr-1 text-right font-bold">
                Plus (₹)
              </th>
              <th scope="col" className="w-20 py-1 text-right font-bold">
                Minus (₹)
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr className="border-b border-edge font-bold">
              <td className="py-1 pr-1">{st.startLabel}</td>
              <td className="py-1 pr-1 text-right">{st.start >= 0 ? figure(st.start) : ''}</td>
              <td className="py-1 text-right">{st.start < 0 ? figure(-st.start) : ''}</td>
            </tr>
            {[...st.adds, ...st.lesses]
              .sort((a, b) => a.item.day - b.item.day)
              .map((l) => (
                <tr key={l.item.id} data-testid={`lab-bank-reconciliation-statement-${l.plus ? 'plus' : 'minus'}`} className={`border-b border-edge align-top ${row(l)}`}>
                  <td className="py-1 pr-1">
                    {tag(l)}
                    {l.facts.line}
                  </td>
                  <td className="py-1 pr-1 text-right">{l.plus ? figure(l.item.amount) : ''}</td>
                  <td className="py-1 text-right">{l.plus ? '' : figure(l.item.amount)}</td>
                </tr>
              ))}
            <tr className="border-y border-edge font-bold">
              <td className="py-1 pr-1">Totals</td>
              <td className="py-1 pr-1 text-right">{figure(st.plusTotal)}</td>
              <td className="py-1 text-right">{figure(st.minusTotal)}</td>
            </tr>
            <tr className={`border-b-2 border-edge-deep font-extrabold ${st.complete ? '' : 'text-muted'}`}>
              <td data-testid="lab-bank-reconciliation-statement-end-label" className="py-1 pr-1">
                {st.endLabel} <span className="font-normal text-muted">(Plus total - Minus total)</span>
              </td>
              <td colSpan={2} data-testid="lab-bank-reconciliation-statement-end" className="py-1 text-right">
                {figure(Math.abs(st.end))}
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {empty ? <p className="text-center text-sm text-muted">No item carried in yet: the statement starts from the balance alone.</p> : null}
      {st.start < 0 ? <p className="text-xs text-muted">From an overdraft the rule turns round: what would be added to a favourable balance is deducted from an overdraft, and the reverse.</p> : null}
    </section>
  );
}
