'use client';

import { HUE_FILL, type Hue } from '@/components/ui/hues';
import { plainNumber } from '@/simulator/spreadsheet/evaluate';
import { slicePath, type ChartData } from '@/simulator/spreadsheet/chart';
import type { ChartKind } from '@/simulator/spreadsheet/workbooks';

// ---------------------------------------------------------------------------------------------------------------
// A chart drawn from a range of the sheet, as SVG: a pie (the parts of one whole, each slice its share of 360°) or
// bars (separate items side by side, one colour, each bar labelled with its figure). The pie's slices take the app's
// hues in a fixed order, with a gap of the card's colour between them, and the key beside it names each slice with
// its figure, share and angle, so that colour is never the only way to tell them apart.
// ---------------------------------------------------------------------------------------------------------------

const SLICE_HUES: readonly Hue[] = ['blue', 'violet', 'rose', 'teal', 'orange', 'sky', 'green', 'amber'];
const SLICE_FILL: Record<Hue, string> = {
  green: 'fill-hue-green',
  teal: 'fill-hue-teal',
  blue: 'fill-hue-blue',
  violet: 'fill-hue-violet',
  rose: 'fill-hue-rose',
  amber: 'fill-hue-amber',
  orange: 'fill-hue-orange',
  sky: 'fill-hue-sky',
};
const hueOf = (i: number): Hue => SLICE_HUES[i % SLICE_HUES.length];
const round2 = (v: number) => plainNumber(Math.round(v * 100) / 100);

export function ChartView({ prefix, kind, data, title }: { prefix: string; kind: ChartKind; data: ChartData; title: string }) {
  if (!data.ok) {
    return (
      <p data-testid={`${prefix}-chart-problem`} role="status" className="rounded-control border-2 border-dashed border-danger bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-deep">
        {data.problem}
      </p>
    );
  }
  const { items } = data;
  const summary = `${kind === 'pie' ? 'Pie chart' : 'Bar chart'}: ${title}. ${items.map((x) => `${x.label} ${x.shown}${kind === 'pie' ? `, ${round2(x.share)}%, ${round2(x.angle)}°` : ''}`).join('; ')}.`;
  if (kind === 'pie') {
    let start = 0;
    return (
      <figure data-testid={`${prefix}-chart`} data-kind="pie" className="flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-start">
        <svg viewBox="0 0 200 200" role="img" aria-label={summary} className="h-auto w-full max-w-[13rem] shrink-0">
          {items.map((x, i) => {
            const end = start + x.angle;
            const d = slicePath(100, 100, 92, start, end);
            start = end;
            return (
              <path key={i} d={d} className={`${SLICE_FILL[hueOf(i)]} stroke-surface`} strokeWidth={2} strokeLinejoin="round">
                <title>{`${x.label}: ${x.shown}, ${round2(x.share)}% of the total, ${round2(x.angle)}°`}</title>
              </path>
            );
          })}
        </svg>
        <figcaption className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="font-extrabold">{title}</span>
          <ul data-testid={`${prefix}-chart-key`} className="flex flex-col gap-1">
            {items.map((x, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span aria-hidden="true" className={`inline-block h-3 w-3 shrink-0 translate-y-0.5 rounded-sm ${HUE_FILL[hueOf(i)]}`} />
                <span>
                  <span className="font-bold">{x.label}</span> <span className="tabular-nums">{x.shown}</span>{' '}
                  <span className="text-muted tabular-nums">
                    ({round2(x.share)}%, {round2(x.angle)}°)
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <span className="text-xs text-muted">Total {data.totalShown}: the whole circle, 360°.</span>
        </figcaption>
      </figure>
    );
  }
  // Bars: one row each, from a line at nil (to the left of it for a figure below nil).
  const max = Math.max(...items.map((x) => Math.abs(x.value)), 1);
  const anyNegative = items.some((x) => x.value < 0);
  const row = 30;
  const labelW = 96;
  const plotW = 190;
  const zero = labelW + (anyNegative ? plotW / 2 : 0);
  const span = anyNegative ? plotW / 2 : plotW;
  const height = items.length * row + 8;
  return (
    <figure data-testid={`${prefix}-chart`} data-kind="bar" className="flex min-w-0 flex-col gap-2">
      <figcaption className="text-sm font-extrabold">{title}</figcaption>
      <svg viewBox={`0 0 ${labelW + plotW + 74} ${height}`} role="img" aria-label={summary} className="h-auto w-full max-w-xl">
        {items.map((x, i) => {
          const w = (Math.abs(x.value) / max) * span;
          const y = 4 + i * row;
          const left = x.value < 0 ? zero - w : zero;
          return (
            <g key={i}>
              <text x={labelW - 6} y={y + row / 2} dominantBaseline="middle" textAnchor="end" className="fill-ink text-[11px] font-bold">
                {x.label.length > 15 ? `${x.label.slice(0, 14)}…` : x.label}
              </text>
              <rect x={left} y={y + 5} width={Math.max(w, 1)} height={row - 10} rx={4} className="fill-hue-blue">
                <title>{`${x.label}: ${x.shown}`}</title>
              </rect>
              <text x={x.value < 0 ? left - 4 : left + w + 4} y={y + row / 2} dominantBaseline="middle" textAnchor={x.value < 0 ? 'end' : 'start'} className="fill-ink text-[11px] tabular-nums">
                {x.shown}
              </text>
            </g>
          );
        })}
        <line x1={zero} x2={zero} y1={2} y2={height - 2} className="stroke-edge-deep" strokeWidth={1.5} />
      </svg>
    </figure>
  );
}
