'use client';

import { formatINR } from '@/engine/money';
import { cmp, ZERO } from '@/simulator/partnership/fraction';
import type { GwStage } from '@/simulator/goodwill/steps';
import { adjustmentShort, show, toPaise, type Valuation, type YearRow } from '@/simulator/goodwill/valuation';
import { Arrive, Leave } from '../kit/Arrive';

// ---------------------------------------------------------------------------------------------------------------
// The picture of a valuation: each past year a bar of its profit (a loss hangs below the line), corrected piece by
// piece (a piece added flies in, a piece cut drops away); the average as a line across the bars; the normal profit
// as a second line under it, and the super profit as the band between the two. Every line and bar is named with its
// figure in text below the picture.
// ---------------------------------------------------------------------------------------------------------------

const P = 'lab-goodwill';
const inr = formatINR;

/** A year's profit after the first `n` adjustments. */
const after = (y: YearRow, n: number): number => y.books + y.deltas.filter((d) => d.from < n).reduce((s, d) => s + d.by, 0);

export function ProfitBars({ v, stage, reduced }: { v: Valuation; stage: GwStage; reduced: boolean }) {
  const n = Math.min(stage.adjusted, v.inputs.adjustments.length);
  const values = v.years.map((y) => after(y, n));
  const avgBefore = toPaise(v.average);
  const avg = toPaise(v.averageAfter);
  const normal = toPaise(v.normalProfit);
  const lineAvg = stage.average ? (stage.remuneration ? avg : avgBefore) : null;
  const lineNormal = stage.normal ? normal : null;
  const all = [...v.years.flatMap((y) => [y.books, y.normal, ...y.deltas.map((_, i) => after(y, y.deltas[i].from + 1))]), avgBefore, avg, ...(stage.normal ? [normal] : []), 0];
  const top = Math.max(...all) * 1.12 || 1;
  const bottom = Math.min(...all) < 0 ? Math.min(...all) * 1.25 : 0;
  const range = top - bottom;
  /** From the top of the picture, as a share of its height (0 to 100). */
  const y = (val: number) => ((top - val) / range) * 100;
  const move = reduced ? '' : 'transition-transform duration-700 ease-out';
  const fade = reduced ? 'transition-opacity duration-300' : '';
  const sup = v.superProfit;
  const supAbove = cmp(sup, ZERO) > 0;
  const just = stage.justAdjusted;

  const summary = [
    ...v.years.map((yr, i) => `${yr.label}: ${values[i] < 0 ? `loss ${inr(-values[i])}` : inr(values[i])}${yr.books !== values[i] ? ` (books ${yr.books < 0 ? `loss ${inr(-yr.books)}` : inr(yr.books)})` : ''}${stage.weights ? `, weight ${yr.weight}` : ''}`),
    ...(lineAvg !== null ? [`average ${inr(lineAvg)}`] : []),
    ...(lineNormal !== null ? [`normal profit ${inr(lineNormal)}`] : []),
  ].join('; ');

  return (
    <section aria-labelledby="gw-bars-title" data-testid={`${P}-bars`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id="gw-bars-title" className="text-base font-extrabold">
          Past profits, {stage.adjusted > 0 ? 'corrected to normal profits' : 'as the books show them'}
        </h3>
        <p className="text-xs text-muted">Years ended 31 March</p>
      </header>
      <div role="img" aria-label={`Profits of the years. ${summary}.`} className="relative h-64 w-full overflow-hidden rounded-control bg-sunken sm:h-72">
        {/* The line of nil. */}
        <div aria-hidden="true" className="absolute inset-x-0 border-t-2 border-edge-deep" style={{ top: `${y(0)}%` }} />
        <div aria-hidden="true" className="absolute inset-0 flex gap-1.5 px-1.5 sm:gap-3 sm:px-3">
          {v.years.map((yr, i) => {
            const val = values[i];
            const pos = val >= 0;
            const from = pos ? y(val) : y(0);
            const h = Math.abs(y(val) - y(0)) / 100;
            const prev = just !== null ? after(yr, just) : null;
            const touched = just !== null && yr.deltas.some((d) => d.from === just);
            return (
              <div key={yr.label} className="relative h-full min-w-0 flex-1">
                {/* As the books show it: a dashed outline once a correction has been made. */}
                {n > 0 && yr.books !== val ? (
                  <div className="absolute inset-x-1 border-2 border-dashed border-edge-deep" style={{ top: `${Math.min(y(yr.books), y(0))}%`, height: `${Math.abs(y(yr.books) - y(0))}%` }} />
                ) : null}
                <div className={`absolute inset-x-1 top-0 h-full origin-top ${move}`} style={{ transform: `translateY(${from}%) scaleY(${h})` }}>
                  <div className={`h-full w-full rounded-t-sm ${pos ? 'bg-hue-blue/80' : 'sim-deduction'}`} />
                </div>
                {touched && prev !== null && prev !== val ? (
                  val > prev ? (
                    <Arrive
                      key={`add-${just}`}
                      reduced={reduced}
                      from="translateY(-3rem)"
                      className="absolute inset-x-0 block rounded-sm border-2 border-hue-green bg-hue-green/70"
                      style={{ top: `${y(val)}%`, height: `${y(prev) - y(val)}%` }}
                    />
                  ) : (
                    <Leave key={`cut-${just}`} reduced={reduced} to="translateY(4rem) rotate(8deg)" className="sim-deduction absolute inset-x-0 block rounded-sm border-2 border-danger" style={{ top: `${y(prev)}%`, height: `${y(val) - y(prev)}%` }} />
                  )
                ) : null}
                {stage.weights ? (
                  <span className="absolute inset-x-0 bottom-1 mx-auto w-fit rounded-full bg-surface px-1.5 text-xs font-extrabold text-hue-violet ring-1 ring-hue-violet">x{yr.weight}</span>
                ) : null}
              </div>
            );
          })}
        </div>
        {/* The super profit: the band between the normal profit and the average. */}
        {stage.super && lineAvg !== null && lineNormal !== null ? (
          <div aria-hidden="true" className={`absolute inset-0 origin-top ${move}`} style={{ transform: `translateY(${Math.min(y(lineAvg), y(lineNormal))}%) scaleY(${Math.abs(y(lineAvg) - y(lineNormal)) / 100})` }}>
            <div className={`h-full w-full ${supAbove ? 'bg-hue-green/30' : 'sim-deduction'}`} />
          </div>
        ) : null}
        {stage.remuneration && stage.average && avgBefore !== avg ? <Line at={y(avgBefore)} cls="border-hue-amber/50" label="" move={move} faint /> : null}
        {lineAvg !== null ? <Line at={y(lineAvg)} cls="border-hue-amber" label={`${stage.remuneration && v.inputs.remuneration > 0 ? 'Average after remuneration' : stage.weights ? 'Weighted average' : 'Average'} ${inr(lineAvg)}`} move={move} labelSide="left" testId={`${P}-line-average`} /> : null}
        {lineNormal !== null ? <Line at={y(lineNormal)} cls="border-hue-violet" label={`Normal profit ${inr(lineNormal)}`} move={move} labelSide="right" testId={`${P}-line-normal`} below={lineAvg !== null && lineAvg >= lineNormal} /> : null}
      </div>
      <ol className={`grid gap-1.5 text-xs sm:gap-3 ${fade}`} style={{ gridTemplateColumns: `repeat(${v.years.length}, minmax(0, 1fr))` }}>
        {v.years.map((yr, i) => (
          <li key={yr.label} data-testid={`${P}-year`} className="flex min-w-0 flex-col items-center text-center">
            <span className="font-bold text-muted">{yr.label}</span>
            <span className={`font-extrabold tabular-nums ${values[i] < 0 ? 'text-danger-deep' : ''}`}>{values[i] < 0 ? `(${inr(-values[i])})` : inr(values[i])}</span>
            {values[i] < 0 ? <span className="text-muted">loss</span> : null}
            {yr.deltas
              .filter((d) => d.from < n)
              .map((d, k) => (
                <span key={k} className={`break-words ${d.by > 0 ? 'text-primary-ink' : 'text-danger-deep'}`}>
                  <span className="whitespace-nowrap">
                    {d.by > 0 ? '▲ +' : '▼ -'}
                    {inr(Math.abs(d.by))}
                  </span>
                  <span className="block text-muted">{adjustmentShort(v.inputs.adjustments[d.from])}</span>
                </span>
              ))}
            {stage.weights ? <span className="text-hue-violet">x{yr.weight} = {inr(yr.normal * yr.weight)}</span> : null}
          </li>
        ))}
      </ol>
      <ul data-testid={`${P}-lines`} className="flex flex-col gap-0.5 text-sm">
        {lineAvg !== null ? (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-6 border-t-2 border-dashed border-hue-amber" />
            {stage.weights ? 'Weighted average profit' : 'Average profit'}
            {stage.remuneration && v.inputs.remuneration > 0 ? `, after the partners' remuneration of ${inr(v.inputs.remuneration)}` : ''}:{' '}
            <strong data-testid={`${P}-average`} className="tabular-nums">
              {show(stage.remuneration ? v.averageAfter : v.average)}
            </strong>
          </li>
        ) : null}
        {lineNormal !== null ? (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-6 border-t-2 border-hue-violet" />
            Normal profit ({inr(v.capitalEmployed)} x {v.inputs.rate}%):{' '}
            <strong data-testid={`${P}-normal`} className="tabular-nums">
              {show(v.normalProfit)}
            </strong>
          </li>
        ) : null}
        {stage.super ? (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className={`inline-block h-3 w-6 rounded-sm ${supAbove ? 'bg-hue-green/40' : 'sim-deduction'}`} />
            {supAbove ? 'Super profit (the band above the normal profit)' : 'Short of the normal profit (no super profit)'}:{' '}
            <strong data-testid={`${P}-super`} className="tabular-nums">
              {supAbove ? show(sup) : `nil (short by ${show({ n: -sup.n, d: sup.d })})`}
            </strong>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function Line({ at, cls, label, move, faint, labelSide = 'left', testId, below }: { at: number; cls: string; label: string; move: string; faint?: boolean; labelSide?: 'left' | 'right'; testId?: string; below?: boolean }) {
  return (
    <div aria-hidden="true" data-testid={testId} className={`pointer-events-none absolute inset-0 ${move}`} style={{ transform: `translateY(${at}%)` }}>
      <div className={`border-t-2 border-dashed ${cls} ${faint ? 'opacity-60' : ''}`} />
      {label ? (
        <span className={`absolute ${labelSide === 'left' ? 'left-1' : 'right-1'} ${below ? 'top-0.5' : '-translate-y-full -mt-0.5'} rounded bg-surface/90 px-1 text-[11px] font-extrabold leading-tight`}>{label}</span>
      ) : null}
    </div>
  );
}
