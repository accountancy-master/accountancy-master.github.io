'use client';

import type { Group, RatioDef } from '@/simulator/ratios/model';

// A dial: a half circle from the low end of the ratio's face to the high end, a needle that turns to the value (by
// transform, so it swings when a figure changes), and a tick at a figure often quoted (2 : 1 for the current ratio).
// It is a picture only: the value is always written beside it.

export const GROUP_STROKE: Record<Group, string> = {
  liquidity: 'stroke-hue-sky',
  solvency: 'stroke-hue-violet',
  activity: 'stroke-hue-amber',
  profitability: 'stroke-hue-green',
};
export const GROUP_INK: Record<Group, string> = {
  liquidity: 'text-hue-sky',
  solvency: 'text-hue-violet',
  activity: 'text-hue-amber',
  profitability: 'text-hue-green',
};

const CX = 60;
const CY = 60;
const R = 48;

const point = (t: number, r = R) => {
  const a = Math.PI * (1 - t);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
};

/** Where on the face a value stands, from 0 (low end) to 1 (high end), and whether it is off the face. */
export function placeOnDial(def: RatioDef, value: number): { t: number; off: 'low' | 'high' | null } {
  const { min, max } = def.dial;
  const t = (value - min) / (max - min);
  return { t: Math.min(1, Math.max(0, t)), off: t < 0 ? 'low' : t > 1 ? 'high' : null };
}

export function Dial({ def, value, className = '' }: { def: RatioDef; value: number | null; className?: string }) {
  const place = value === null ? null : placeOnDial(def, value);
  const angle = place ? -90 + 180 * place.t : -90;
  const [x0, y0] = point(0);
  const [x1, y1] = point(1);
  const mark = def.dial.mark ? placeOnDial(def, def.dial.mark.at).t : null;
  const unit = def.unit === 'percent' ? '%' : '';
  return (
    <svg viewBox="0 0 120 72" aria-hidden="true" className={className}>
      <path d={`M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}`} className={`fill-none ${GROUP_STROKE[def.group]}`} strokeWidth="9" strokeLinecap="round" opacity="0.3" />
      {mark !== null ? (
        <line x1={point(mark, R - 9)[0]} y1={point(mark, R - 9)[1]} x2={point(mark, R + 7)[0]} y2={point(mark, R + 7)[1]} className="stroke-ink" strokeWidth="1.5" strokeDasharray="2 1.5" />
      ) : null}
      <text x={x0} y={71} textAnchor="middle" className="fill-muted text-[8px] font-bold">
        {def.dial.min}
        {unit}
      </text>
      <text x={x1} y={71} textAnchor="middle" className="fill-muted text-[8px] font-bold">
        {def.dial.max}
        {unit}
      </text>
      {place ? (
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${CX}px ${CY}px` }} className="transition-transform duration-700 ease-out">
          <line x1={CX} y1={CY} x2={CX} y2={CY - R + 4} className="stroke-ink" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      ) : null}
      <circle cx={CX} cy={CY} r="4" className="fill-ink" />
      {place?.off ? (
        <text x={place.off === 'high' ? x1 - 4 : x0 + 4} y={CY - 2} textAnchor={place.off === 'high' ? 'end' : 'start'} className="fill-danger-deep text-[8px] font-extrabold">
          {place.off === 'high' ? 'beyond ▶' : '◀ below'}
        </text>
      ) : null}
    </svg>
  );
}
