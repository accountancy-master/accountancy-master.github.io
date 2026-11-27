'use client';

import { formatINR } from '@/engine/money';
import type { GwStage } from '@/simulator/goodwill/steps';
import {
  averageWorking, capitalisedWorking, capitalWorking, goodwillWorking, normalWorking, remunerationWorking, superWorking, type Valuation,
} from '@/simulator/goodwill/valuation';

// The working as a student writes it in the examination: a table of the normal profits (with the weights and
// products for a weighted average), then the calculation of goodwill line by line. It follows the picture: only what
// has been worked so far is written.

const P = 'lab-goodwill';
const amount = (p: number) => (p < 0 ? `(${formatINR(-p).slice(1)})` : formatINR(p).slice(1));

export function Statement({ v, stage }: { v: Valuation; stage: GwStage }) {
  const n = Math.min(stage.adjusted, v.inputs.adjustments.length);
  const weighted = v.inputs.averaging === 'weighted' && stage.weights;
  const rows = v.years.map((y) => {
    const deltas = y.deltas.filter((d) => d.from < n);
    const normal = y.books + deltas.reduce((s, d) => s + d.by, 0);
    return { ...y, deltas, normal };
  });
  const m = v.inputs.method;
  const lines = [
    ...(stage.average ? [averageWorking(v)] : []),
    ...(stage.remuneration && v.inputs.remuneration > 0 ? [remunerationWorking(v)] : []),
    ...(stage.capital ? [capitalWorking(v)] : []),
    ...(stage.normal ? [normalWorking(v)] : []),
    ...(stage.super ? [superWorking(v)] : []),
    ...(stage.capitalised ? [capitalisedWorking(v)] : []),
    ...(stage.goodwill ? [goodwillWorking(v, m)] : []),
  ];
  const total = rows.reduce((s, r) => s + r.normal, 0);
  return (
    <section aria-labelledby="gw-statement-title" data-testid={`${P}-statement`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="gw-statement-title" className="text-base font-extrabold">
        In the answer book
      </h3>
      <div className="min-w-0 overflow-x-auto" tabIndex={0} role="region" aria-label="The working, scrolls sideways on a narrow screen">
        <table className="w-full min-w-[28rem] table-fixed border-collapse text-xs sm:text-sm">
          <caption className="pb-1 text-left text-xs font-extrabold uppercase tracking-wide text-muted">Calculation of {weighted ? 'weighted average' : 'average'} profit</caption>
          <thead>
            <tr className="border-b-2 border-edge-deep text-left align-bottom text-muted">
              <th scope="col" className="w-[18%] py-1 pr-1">
                Year
              </th>
              <th scope="col" className="py-1 pr-1 text-right">
                Books (₹)
              </th>
              <th scope="col" className="py-1 pr-1 text-right">
                Adjust&shy;ments (₹)
              </th>
              <th scope="col" className="py-1 pr-1 text-right">
                Normal profit (₹)
              </th>
              {weighted ? (
                <>
                  <th scope="col" className="w-[13%] py-1 pr-1 text-right">
                    Weight
                  </th>
                  <th scope="col" className="py-1 text-right">
                    Product (₹)
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} data-testid={`${P}-statement-row`} className="border-b border-edge align-top">
                <th scope="row" className="py-1 pr-1 text-left font-bold">
                  {r.label}
                </th>
                <td className="py-1 pr-1 text-right tabular-nums">{amount(r.books)}</td>
                <td className="py-1 pr-1 text-right tabular-nums">
                  {r.deltas.length === 0
                    ? '-'
                    : r.deltas.map((d, i) => (
                        <span key={i} className="block">
                          {d.by > 0 ? '+' : '-'}
                          {formatINR(Math.abs(d.by)).slice(1)}
                        </span>
                      ))}
                </td>
                <td className="py-1 pr-1 text-right font-bold tabular-nums">{amount(r.normal)}</td>
                {weighted ? (
                  <>
                    <td className="py-1 pr-1 text-right tabular-nums">{r.weight}</td>
                    <td className="py-1 text-right tabular-nums">{amount(r.normal * r.weight)}</td>
                  </>
                ) : null}
              </tr>
            ))}
            <tr className="border-b-2 border-edge-deep font-extrabold">
              <th scope="row" className="py-1 pr-1 text-left">
                Total
              </th>
              <td />
              <td />
              <td className="py-1 pr-1 text-right tabular-nums">{amount(total)}</td>
              {weighted ? (
                <>
                  <td className="py-1 pr-1 text-right tabular-nums">{v.weightTotal}</td>
                  <td className="py-1 text-right tabular-nums">{amount(rows.reduce((s, r) => s + r.normal * r.weight, 0))}</td>
                </>
              ) : null}
            </tr>
          </tbody>
        </table>
      </div>
      {lines.length ? (
        <ol data-testid={`${P}-working`} className="flex list-decimal flex-col gap-1 pl-5 text-sm">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">The calculation of goodwill is written here as the picture works it out.</p>
      )}
    </section>
  );
}
