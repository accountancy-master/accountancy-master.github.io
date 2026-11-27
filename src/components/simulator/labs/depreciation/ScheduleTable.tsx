'use client';

import { formatINR } from '@/engine/money';
import type { Schedule } from '@/simulator/depreciation/schedule';

/** The depreciation schedule, year by year, as far as the walk-through has gone: the chart in figures. */
export function ScheduleTable({ s, shown }: { s: Schedule; shown: number }) {
  const rows = s.rows.slice(0, Math.max(0, Math.min(shown - 1, s.rows.length)));
  return (
    <section aria-labelledby="dep-schedule-title" className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card sm:p-4">
      <h3 id="dep-schedule-title" className="text-lg font-extrabold">
        Year by year
      </h3>
      <table data-testid="lab-depreciation-schedule" className="w-full border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="border-b-2 border-edge-deep text-left text-muted">
            <th scope="col" className="py-1 pr-1 font-bold">
              Year
            </th>
            <th scope="col" className="py-1 pr-1 text-right font-bold">
              Opening
            </th>
            <th scope="col" className="py-1 pr-1 text-right font-bold">
              Depreciation
            </th>
            <th scope="col" className="py-1 text-right font-bold">
              Closing
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-2 text-muted">
                Nothing charged yet.
              </td>
            </tr>
          ) : null}
          {rows.map((r) => (
            <tr key={r.index} data-testid="lab-depreciation-schedule-row" className="border-b border-edge align-top tabular-nums">
              <th scope="row" className="py-1 pr-1 text-left font-bold">
                {r.label}
                <span className="block text-[11px] font-normal text-muted">{r.sold ? `to ${r.to}, ` : ''}{r.months} months</span>
              </th>
              <td className="py-1 pr-1 text-right">{formatINR(r.opening)}</td>
              <td className="py-1 pr-1 text-right text-danger-deep">{formatINR(r.charge)}</td>
              <td className="py-1 text-right font-bold">{formatINR(r.closing)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted">Closing book value = opening book value - depreciation of the year. The year ends on 31 March.</p>
    </section>
  );
}
