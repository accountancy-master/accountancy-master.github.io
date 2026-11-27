'use client';

import { useRef } from 'react';
import { formatINR } from '@/engine/money';
import { frText, value, type Fr } from '@/simulator/partnership/fraction';
import type { Recon } from '@/simulator/partnership/reconstitution';
import { useFlights } from '../kit/flights';

// ---------------------------------------------------------------------------------------------------------------
// The profit as a circle cut into the partners' shares. When the partners change, the wedges that change hands
// come loose (the sacrifice) and turn round the centre into their new owner's place (the new ratio): every wedge
// is a rigid piece rotated by transform, so nothing is redrawn. A wedge keeps its old owner's colour, with hatching
// and its new owner's outline, so the eye can follow who gave what to whom. Goodwill then flies between the
// partners' capital accounts.
// ---------------------------------------------------------------------------------------------------------------

export const PARTNER_HUES = ['blue', 'violet', 'teal', 'orange'] as const;
const FILL: Record<(typeof PARTNER_HUES)[number], string> = { blue: 'fill-hue-blue', violet: 'fill-hue-violet', teal: 'fill-hue-teal', orange: 'fill-hue-orange' };
const STROKE: Record<(typeof PARTNER_HUES)[number], string> = { blue: 'stroke-hue-blue', violet: 'stroke-hue-violet', teal: 'stroke-hue-teal', orange: 'stroke-hue-orange' };
export const SWATCH: Record<(typeof PARTNER_HUES)[number], string> = { blue: 'bg-hue-blue', violet: 'bg-hue-violet', teal: 'bg-hue-teal', orange: 'bg-hue-orange' };
const hueOf = (i: number) => PARTNER_HUES[i % PARTNER_HUES.length];

const C = 120;
const RADIUS = 100;

function wedge(start: number, size: number): string {
  if (size >= 0.9999) return `M ${C} ${C - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${C - 0.01} ${C - RADIUS} Z`;
  const a0 = start * 2 * Math.PI - Math.PI / 2;
  const a1 = (start + size) * 2 * Math.PI - Math.PI / 2;
  const p = (a: number) => `${(C + RADIUS * Math.cos(a)).toFixed(2)} ${(C + RADIUS * Math.sin(a)).toFixed(2)}`;
  return `M ${C} ${C} L ${p(a0)} A ${RADIUS} ${RADIUS} 0 ${size > 0.5 ? 1 : 0} 1 ${p(a1)} Z`;
}

export type PiePhase = 'old' | 'split' | 'new';

export function phaseOf(recon: Recon, shown: number): { phase: PiePhase; goodwill: boolean; entries: number } {
  const seen = recon.steps.slice(0, shown).map((s) => s.key);
  const phase: PiePhase = seen.includes('new') ? 'new' : seen.includes('split') ? 'split' : 'old';
  const entries = shown > 0 ? recon.steps[shown - 1].entries : 0;
  return { phase, goodwill: seen.includes('goodwill'), entries };
}

export function RatioPie({ recon, shown, advanced, reduced }: { recon: Recon; shown: number; advanced: number | null; reduced: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const { phase, goodwill } = phaseOf(recon, shown);
  const premiumIn = recon.steps.slice(0, shown).some((s) => s.key === 'premium');
  const spot = (x: number | 'bank') => (x === 'bank' ? 'bank' : `p${x}`);
  useFlights(root, advanced, shown, (i) => recon.steps[i].flows.map((f) => ({ from: spot(f.from), to: spot(f.to), text: formatINR(f.amount) })), reduced);
  const leaving = recon.input.event.kind === 'retirement' || recon.input.event.kind === 'death' ? recon.subject : null;
  const joining = recon.input.event.kind === 'admission' ? recon.subject : null;
  const hasBank = recon.input.event.kind === 'admission' && recon.input.event.premium === 'cash';
  const deg = (f: Fr) => value(f) * 360;

  return (
    <div ref={root} className="relative flex min-w-0 flex-col items-center gap-3">
      <svg viewBox="0 0 240 240" className="w-full max-w-[15rem]" role="img" aria-label={pieLabel(recon, phase)} data-testid="lab-partnership-pie" data-phase={phase}>
        <defs>
          <pattern id="pie-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="transparent" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="white" strokeOpacity="0.55" strokeWidth="2.5" />
          </pattern>
        </defs>
        <circle cx={C} cy={C} r={RADIUS + 6} className="fill-none stroke-edge" strokeWidth="2" />
        {recon.pieces.map((pc, k) => {
          const mid = (value(pc.oldStart) + value(pc.size) / 2) * 2 * Math.PI - Math.PI / 2;
          const out = phase === 'split' && pc.moves ? `translate(${(Math.cos(mid) * 12).toFixed(2)}px, ${(Math.sin(mid) * 12).toFixed(2)}px)` : 'translate(0px, 0px)';
          const turn = phase === 'new' ? `rotate(${(deg(pc.newStart) - deg(pc.oldStart)).toFixed(3)}deg)` : 'rotate(0deg)';
          const d = wedge(value(pc.oldStart), value(pc.size));
          return (
            <g key={k} className="transition-transform duration-1000 ease-in-out" style={{ transform: `${out} ${turn}`, transformOrigin: `${C}px ${C}px`, transformBox: 'view-box' }}>
              <path d={d} className={`${FILL[hueOf(pc.from)]} stroke-surface`} strokeWidth="2" />
              {pc.moves ? (
                <>
                  <path d={d} fill="url(#pie-hatch)" />
                  <path d={d} className={`fill-none transition-opacity duration-700 ${STROKE[hueOf(pc.to)]} ${phase === 'old' ? 'opacity-0' : 'opacity-100'}`} strokeWidth="4" strokeLinejoin="round" />
                </>
              ) : null}
            </g>
          );
        })}
      </svg>

      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs font-bold" aria-hidden="true">
        {recon.names.map((n, i) => (
          <li key={n} className="flex items-center gap-1">
            <span className={`inline-block size-3 rounded-sm ${SWATCH[hueOf(i)]}`} />
            {n}
          </li>
        ))}
        <li className="flex items-center gap-1 text-muted">
          <span className={`inline-block size-3 rounded-sm bg-edge-deep bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgb(255_255_255/0.6)_3px_5px)]`} />
          changes hands
        </li>
      </ul>

      <div className="w-full overflow-hidden rounded-control border border-edge">
        <table data-testid="lab-partnership-ratio-table" className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">Old share, change and new share of each partner</caption>
          <thead className="bg-sunken text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-2 py-1">
                Partner
              </th>
              <th scope="col" className="px-1 py-1 text-right">
                Old
              </th>
              <th scope="col" className="px-1 py-1 text-right">
                Change
              </th>
              <th scope="col" className="px-2 py-1 text-right">
                New
              </th>
            </tr>
          </thead>
          <tbody>
            {recon.names.map((n, i) => {
              const c = recon.change[i];
              return (
                <tr key={n} className="border-t border-edge">
                  <th scope="row" className="truncate px-2 py-1 text-left font-bold">
                    <span aria-hidden="true" className={`mr-1 inline-block size-2.5 rounded-sm ${SWATCH[hueOf(i)]}`} />
                    {n}
                  </th>
                  <td className="px-1 py-1 text-right tabular-nums">{frText(recon.oldShares[i])}</td>
                  <td className="px-1 py-1 text-right tabular-nums">{phase === 'old' ? '' : c.n === 0 ? 'nil' : c.n < 0 ? `gives ${frText({ n: -c.n, d: c.d })}` : `gains ${frText(c)}`}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{phase === 'new' ? (i === leaving ? 'leaves' : frText(recon.newShares[i])) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p data-testid="lab-partnership-ratios" className="border-t border-edge bg-sunken px-2 py-1 text-sm font-bold">
          {phase === 'old' ? `Old ratio ${recon.oldRatio.filter((_, i) => i !== joining).join(':')}` : null}
          {phase !== 'old' ? ratioLine(recon) : null}
          {phase === 'new' ? ` · New ratio ${recon.newRatio.filter((_, i) => i !== leaving).join(':')}` : null}
        </p>
      </div>

      <ul className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Capital accounts">
        {recon.names.map((n, i) => {
          const g = recon.goodwillShares[i];
          return (
            <li key={n} data-spot={`p${i}`} data-testid={`lab-partnership-goodwill-${i}`} className="flex min-w-0 flex-col rounded-control border border-edge bg-surface px-2 py-1 text-xs">
              <span className="truncate font-extrabold">{n}&apos;s Capital A/c</span>
              <span className="tabular-nums">{goodwill && g !== 0 ? (g > 0 ? `Cr ${formatINR(g)} goodwill` : `Dr ${formatINR(-g)} goodwill`) : goodwill ? 'no goodwill' : '—'}</span>
            </li>
          );
        })}
        {hasBank ? (
          <li data-spot="bank" className="flex min-w-0 flex-col rounded-control border border-edge bg-surface px-2 py-1 text-xs">
            <span className="font-extrabold">Bank A/c</span>
            <span className="tabular-nums">{premiumIn && recon.input.event.kind === 'admission' ? `Dr ${formatINR(recon.input.event.capital + recon.goodwillAmount)}` : '—'}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ratioLine(r: Recon): string {
  const sac = r.sacrificers.length === 1 ? `${r.names[r.sacrificers[0]]} alone sacrifices` : `Sacrificing ratio ${r.sacrificingRatio.join(':')}`;
  const gain = r.gainers.length === 1 ? `${r.names[r.gainers[0]]} alone gains` : `Gaining ratio ${r.gainingRatio.join(':')}`;
  const alsoGives = r.sacrificers.filter((i) => i !== r.subject).map((i) => `${r.names[i]} also gives up a share`);
  return r.input.event.kind === 'admission' ? sac : r.input.event.kind === 'change' ? `${sac} · ${gain}` : [gain, ...alsoGives].join(' · ');
}

function pieLabel(r: Recon, phase: PiePhase): string {
  const shares = (s: readonly Fr[]) =>
    r.names
      .map((n, i) => (s[i].n === 0 ? null : `${n} ${frText(s[i])}`))
      .filter(Boolean)
      .join(', ');
  return phase === 'new' ? `The profit in the new shares: ${shares(r.newShares)}.` : `The profit in the old shares: ${shares(r.oldShares)}.`;
}
