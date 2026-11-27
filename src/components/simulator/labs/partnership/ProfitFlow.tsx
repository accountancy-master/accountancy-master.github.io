'use client';

import { useMemo, useRef } from 'react';
import { formatINR } from '@/engine/money';
import { LAYER_NAMES, partnerAccount, type Appropriation, type Layer, type LayerKind } from '@/simulator/partnership/appropriation';
import { useFlights } from '../kit/flights';

// ---------------------------------------------------------------------------------------------------------------
// The year's profit as a pool that is emptied into the partners: the net profit pours into the Profit and Loss
// Appropriation A/c, interest on drawings runs back into it from the partners, then interest on capital, salaries
// and commission are drawn off to the partners, and what is left is split in the ratio. Each partner is a column
// that fills with what is credited (and dips below the line for what is debited). Bars move by transform only.
// ---------------------------------------------------------------------------------------------------------------

/** Kinds stacked above the line (credits), in order from the bottom, and below it (debits). */
const UP: LayerKind[] = ['ioc', 'salary', 'commission', 'share', 'guarantee'];
const DOWN: LayerKind[] = ['iod', 'share'];

export const LAYER_FILL: Record<LayerKind, string> = {
  ioc: 'bg-hue-blue',
  salary: 'bg-hue-violet',
  commission: 'bg-hue-teal',
  share: 'bg-hue-green',
  guarantee: 'bg-hue-amber',
  iod: 'bg-hue-rose',
};
const HATCH = 'bg-[repeating-linear-gradient(135deg,transparent_0_5px,rgb(255_255_255/0.5)_5px_8px)]';

const signed = (p: number) => (p < 0 ? `−${formatINR(-p)}` : formatINR(p));

export function ProfitFlow({ app, shown, advanced, reduced, compact }: { app: Appropriation; shown: number; advanced: number | null; reduced: boolean; compact: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const { steps, input } = app;
  const state = shown > 0 ? steps[Math.min(shown, steps.length) - 1] : null;
  const layers: Layer[][] = state ? state.layers : input.partners.map(() => []);
  const pool = state ? state.pool : 0;

  // One scale for the whole walk-through, so that bars never jump.
  const scale = useMemo(() => {
    let up = 1;
    let down = 0;
    let top = 1;
    for (const s of steps) {
      top = Math.max(top, Math.abs(s.pool));
      for (const ls of s.layers) {
        up = Math.max(up, ls.filter((l) => l.amount > 0).reduce((t, l) => t + l.amount, 0));
        down = Math.max(down, ls.filter((l) => l.amount < 0).reduce((t, l) => t - l.amount, 0));
      }
    }
    return { up, down, top };
  }, [steps]);
  const H = compact ? 120 : 170;
  const unit = Math.max(scale.up, scale.down);
  const upH = scale.up > 1 ? Math.max(24, (H * scale.up) / unit) : 0;
  const downH = scale.down > 0 ? Math.max(16, (H * scale.down) / unit) : 0;

  useFlights(root, advanced, shown, (i) => steps[i].flows.map((f) => ({ from: f.from, to: f.to, text: formatINR(f.amount) })), reduced);

  const n = input.partners.length;
  return (
    <div ref={root} className="relative flex min-w-0 flex-col gap-3">
      <div className="flex justify-center">
        <p data-spot="outside" className="rounded-full border border-dashed border-edge-deep px-3 py-1 text-xs font-bold text-muted">
          From the Profit and Loss A/c: net {input.netProfit < 0 ? 'loss' : 'profit'} {formatINR(Math.abs(input.netProfit))}
        </p>
      </div>

      <div data-spot="pool" className="flex flex-col gap-1 rounded-card border-2 border-hue-green bg-surface px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-extrabold">Profit and Loss Appropriation A/c</span>
          <span data-testid="lab-partnership-pool" className={`text-base font-extrabold tabular-nums ${pool < 0 ? 'text-danger-deep' : ''}`}>
            {pool < 0 ? `Loss to share ${formatINR(-pool)}` : `To share ${formatINR(pool)}`}
          </span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
          <div
            className={`h-full w-full origin-left rounded-full transition-transform duration-700 ease-out ${pool < 0 ? `bg-danger ${HATCH}` : 'bg-hue-green'}`}
            style={{ transform: `scaleX(${Math.min(1, Math.abs(pool) / scale.top)})` }}
          />
        </div>
      </div>

      <ul className={`grid gap-2 ${n === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} aria-label="The partners">
        {input.partners.map((p, i) => {
          const ls = layers[i];
          const amountOf = (k: LayerKind, sign: 1 | -1) => ls.filter((l) => l.kind === k && Math.sign(l.amount) === sign).reduce((t, l) => t + Math.abs(l.amount), 0);
          const net = ls.reduce((t, l) => t + l.amount, 0);
          let up = 0;
          let down = 0;
          return (
            <li key={p.name} data-testid={`lab-partnership-partner-${i}`} className="flex min-w-0 flex-col gap-1 rounded-card border border-edge bg-surface p-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-extrabold">{p.name}</span>
                <span className="truncate text-xs text-muted">
                  Ratio {p.ratio} · {partnerAccount(p.name, input.capitals).replace(`${p.name}'s `, '')}
                </span>
              </div>
              <div data-spot={`p${i}`} className="relative mx-auto w-3/4" aria-hidden="true">
                <div className="relative overflow-hidden rounded-t-md border-b-2 border-ink/60 bg-sunken" style={{ height: upH }}>
                  {UP.map((k) => {
                    const h = amountOf(k, 1);
                    const y = up;
                    up += h;
                    return (
                      <div
                        key={k}
                        className={`absolute inset-x-0 bottom-0 origin-bottom transition-transform duration-700 ease-out ${LAYER_FILL[k]}`}
                        style={{ height: upH, transform: `translateY(${-(y / unit) * H}px) scaleY(${upH ? (h / unit) * (H / upH) : 0})` }}
                      />
                    );
                  })}
                </div>
                {downH > 0 ? (
                  <div className="relative overflow-hidden rounded-b-md bg-sunken" style={{ height: downH }}>
                    {DOWN.map((k) => {
                      const h = amountOf(k, -1);
                      const y = down;
                      down += h;
                      return (
                        <div
                          key={k}
                          className={`absolute inset-x-0 top-0 origin-top transition-transform duration-700 ease-out ${k === 'share' ? 'bg-danger' : LAYER_FILL[k]} ${HATCH}`}
                          style={{ height: downH, transform: `translateY(${(y / unit) * H}px) scaleY(${(h / unit) * (H / downH)})` }}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <ul className="flex flex-col gap-0.5 text-xs" aria-label={`${p.name}: what the year brings`}>
                {ls.length === 0 ? <li className="text-muted">Nothing yet</li> : null}
                {ls.map((l) => (
                  <li key={l.kind} className="flex items-start gap-1">
                    <span aria-hidden="true" className={`mt-0.5 inline-block size-2.5 shrink-0 rounded-sm ${l.amount < 0 ? (l.kind === 'share' ? 'bg-danger' : LAYER_FILL[l.kind]) : LAYER_FILL[l.kind]} ${l.amount < 0 ? HATCH : ''}`} />
                    <span className="min-w-0 flex-1">{l.kind === 'share' && l.amount < 0 ? 'Share of loss' : LAYER_NAMES[l.kind]}</span>
                    <span className="shrink-0 font-bold tabular-nums">{signed(l.amount)}</span>
                  </li>
                ))}
                {ls.length > 0 ? (
                  <li className="mt-0.5 flex justify-between gap-1 border-t border-edge pt-0.5 font-extrabold">
                    <span>Net</span>
                    <span data-testid={`lab-partnership-partner-${i}-net`} className="tabular-nums">
                      {signed(net)}
                    </span>
                  </li>
                ) : null}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">
        Above the line: credited to the partner. Below the line, hatched: debited (interest on drawings, a share of loss). Interest on capital at {input.iocRate}% p.a. on the opening capital for the year
        {input.iodRate > 0 ? `; interest on drawings at ${input.iodRate}% p.a. for six months on the total drawn (dates not given)` : ''}.
      </p>
    </div>
  );
}
