'use client';

import { useEffect, useRef } from 'react';
import { formatINR, type Paise } from '@/engine/money';
import { signedINR } from '@/simulator/cash-flow/model';

// The reservoir of cash and cash equivalents with its three pipes: operating, investing and financing activities.
// A pipe waits until its part of the statement is written, and then empties into the reservoir (an inflow) or
// drains it (an outflow); the level goes up or down by the net of that part. Droplets in a pipe move by transform
// only, and not at all when the learner asks for less motion. Every figure is also given in words.

export type PipeState = 'waiting' | 'working' | 'flowed';
type Part = 'operating' | 'investing' | 'financing';

const PIPES: { id: Part; title: string; fill: string; ink: string; drop: string }[] = [
  { id: 'operating', title: 'Operating activities', fill: 'bg-hue-teal', ink: 'text-hue-teal', drop: 'bg-hue-teal-soft' },
  { id: 'investing', title: 'Investing activities', fill: 'bg-hue-violet', ink: 'text-hue-violet', drop: 'bg-hue-violet-soft' },
  { id: 'financing', title: 'Financing activities', fill: 'bg-hue-amber', ink: 'text-hue-amber', drop: 'bg-hue-amber-soft' },
];

export function Reservoir({
  opening,
  nets,
  states,
  running,
  level,
  scaleMax,
  reduced,
  prefix,
}: {
  opening: Paise;
  nets: Record<Part, Paise>;
  states: Record<Part, PipeState>;
  /** The figure so far of the part being worked out. */
  running: Paise | null;
  /** The cash in the reservoir now. */
  level: Paise;
  scaleMax: Paise;
  reduced: boolean;
  prefix: string;
}) {
  const biggest = Math.max(1, ...PIPES.map((p) => Math.abs(nets[p.id])));
  const share = (p: Paise) => (scaleMax > 0 ? Math.min(1, Math.max(0, p / scaleMax)) : 0);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3" data-testid={`${prefix}-reservoir`}>
      <ul className="flex min-w-0 flex-col gap-3" aria-label="The three pipes">
        {PIPES.map((p) => {
          const state = states[p.id];
          const net = nets[p.id];
          const into = net >= 0;
          const words =
            state === 'flowed'
              ? `${signedINR(net)} ${net === 0 ? '(nothing flows)' : into ? 'flows in' : 'flows out'}`
              : state === 'working'
                ? `being worked out: ${running === null ? '' : `${running < 0 ? '−' : ''}${formatINR(Math.abs(running))} so far`}`
                : 'waiting';
          return (
            <li key={p.id} data-testid={`${prefix}-pipe-${p.id}`} data-state={state} className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className={`text-sm font-extrabold ${p.ink}`}>{p.title}</span>
                <span className={`text-sm font-extrabold tabular-nums ${state === 'waiting' ? 'text-muted' : ''}`} data-testid={`${prefix}-pipe-${p.id}-text`}>
                  {words}
                </span>
              </div>
              <Pipe
                active={state === 'flowed' && net !== 0}
                into={into}
                thickness={state === 'flowed' ? 0.3 + 0.7 * (Math.abs(net) / biggest) : 0.3}
                fill={state === 'waiting' ? 'bg-edge' : p.fill}
                drop={p.drop}
                dashed={state !== 'flowed'}
                reduced={reduced}
              />
            </li>
          );
        })}
      </ul>

      <div className="flex w-28 flex-col items-center gap-1 text-center sm:w-32">
        <p className="text-xs font-bold text-muted">Cash and cash equivalents</p>
        <div aria-hidden="true" className="relative h-44 w-24 overflow-hidden rounded-b-[1.4rem] border-2 border-t-0 border-edge-deep bg-sunken sm:w-28">
          <div
            className="absolute inset-x-0 bottom-0 h-full origin-bottom bg-hue-sky/70 transition-transform duration-700 ease-out"
            style={{ transform: `scaleY(${share(Math.max(0, level))})` }}
          />
          <div className="absolute inset-x-0 border-t-2 border-dashed border-ink/60" style={{ bottom: `${share(opening) * 100}%` }}>
            <span className="absolute right-1 -top-4 rounded bg-surface/85 px-0.5 text-[0.65rem] font-bold text-ink">start</span>
          </div>
        </div>
        <p className="text-lg font-extrabold tabular-nums" data-testid={`${prefix}-cash`}>
          {level < 0 ? `−${formatINR(-level)}` : formatINR(level)}
        </p>
        <p className="text-xs text-muted">At the start {formatINR(opening)}</p>
        {level < 0 ? (
          <p className="text-xs font-bold text-danger-deep" data-testid={`${prefix}-short`}>
            Below nil: cash cannot run out like this. The company would have to raise finance (an overdraft is a financing inflow).
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** A pipe drawn as a rounded channel; when it flows, three droplets travel along it towards the reservoir or away from it. */
function Pipe({ active, into, thickness, fill, drop, dashed, reduced }: { active: boolean; into: boolean; thickness: number; fill: string; drop: string; dashed: boolean; reduced: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !active || reduced || typeof Element === 'undefined' || !('animate' in Element.prototype)) return;
    const width = el.clientWidth;
    const drops = [...el.querySelectorAll<HTMLElement>('[data-drop]')];
    const anims = drops.map((d, i) => {
      const [from, to] = into ? [-12, width] : [width, -12];
      return d.animate([{ transform: `translateX(${from}px)`, opacity: 0 }, { transform: `translateX(${(from + to) / 2}px)`, opacity: 1, offset: 0.5 }, { transform: `translateX(${to}px)`, opacity: 0 }], {
        duration: 1500,
        delay: i * 500,
        iterations: Infinity,
        easing: 'linear',
      });
    });
    return () => anims.forEach((a) => a.cancel());
  }, [active, into, reduced]);

  return (
    <div ref={box} aria-hidden="true" className={`relative flex h-6 items-center overflow-hidden rounded-full border-2 ${dashed ? 'border-dashed border-edge-deep' : 'border-edge-deep'} bg-sunken`}>
      <div className={`absolute inset-0 ${fill} opacity-80 transition-transform duration-500`} style={{ transform: `scaleY(${thickness})` }} />
      {[0, 1, 2].map((i) => (
        <span key={i} data-drop className={`absolute left-0 top-1/2 -mt-1.5 h-3 w-3 rounded-full border border-white/70 ${drop} opacity-0`} />
      ))}
      {active ? <span className="absolute right-1 text-xs font-extrabold text-white drop-shadow">{into ? '→' : '←'}</span> : null}
    </div>
  );
}
