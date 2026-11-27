'use client';

import { forwardRef, Fragment, useImperativeHandle, useMemo, useRef } from 'react';
import { formatINR } from '@/engine/money';
import { bandValues, totalsOf } from '@/simulator/engine';
import { signed } from '@/simulator/explain';
import type { ContainerSpec, Scene, SceneHue } from '@/simulator/scenes';
import type { Balances, BandChange, Move, Paise, Spot } from '@/simulator/types';

// ---------------------------------------------------------------------------------------------------------------
// The 2.5D renderer of a scene: each container a tank drawn with depth (a rim, a liquid surface), its accounts
// stacked inside as bands, and coins that fly between them. Bands and coins move by transform and opacity only, so
// a phone animates them on the compositor. Everything shown is also in text beside the tank.
// ---------------------------------------------------------------------------------------------------------------

/** The classes of a hue, written out so that Tailwind finds them: band shades from strong to light, the rim, the title. */
const HUE: Record<SceneHue, { shades: string[]; edge: string; ink: string; soft: string }> = {
  blue: { shades: ['bg-hue-blue/90', 'bg-hue-blue/65', 'bg-hue-blue/45', 'bg-hue-blue/30'], edge: 'border-hue-blue', ink: 'text-hue-blue', soft: 'bg-hue-blue-soft' },
  rose: { shades: ['bg-hue-rose/90', 'bg-hue-rose/65', 'bg-hue-rose/45', 'bg-hue-rose/30'], edge: 'border-hue-rose', ink: 'text-hue-rose', soft: 'bg-hue-rose-soft' },
  green: { shades: ['bg-hue-green/90', 'bg-hue-green/65', 'bg-hue-green/45', 'bg-hue-green/30'], edge: 'border-hue-green', ink: 'text-hue-green', soft: 'bg-hue-green-soft' },
  amber: { shades: ['bg-hue-amber/90', 'bg-hue-amber/65', 'bg-hue-amber/45', 'bg-hue-amber/30'], edge: 'border-hue-amber', ink: 'text-hue-amber', soft: 'bg-hue-amber-soft' },
  violet: { shades: ['bg-hue-violet/90', 'bg-hue-violet/65', 'bg-hue-violet/45', 'bg-hue-violet/30'], edge: 'border-hue-violet', ink: 'text-hue-violet', soft: 'bg-hue-violet-soft' },
  teal: { shades: ['bg-hue-teal/90', 'bg-hue-teal/65', 'bg-hue-teal/45', 'bg-hue-teal/30'], edge: 'border-hue-teal', ink: 'text-hue-teal', soft: 'bg-hue-teal-soft' },
  orange: { shades: ['bg-hue-orange/90', 'bg-hue-orange/65', 'bg-hue-orange/45', 'bg-hue-orange/30'], edge: 'border-hue-orange', ink: 'text-hue-orange', soft: 'bg-hue-orange-soft' },
  sky: { shades: ['bg-hue-sky/90', 'bg-hue-sky/65', 'bg-hue-sky/45', 'bg-hue-sky/30'], edge: 'border-hue-sky', ink: 'text-hue-sky', soft: 'bg-hue-sky-soft' },
};

export interface TanksHandle {
  /** Flies coins for each move, all at once; resolves when they have landed. Resolves at once with reduced motion. */
  fly(moves: readonly Move[], ms: number): Promise<void>;
}

const spotKey = (s: Spot) => (s === 'outside' ? 'outside' : `${s.container}:${s.band}`);

interface Props {
  scene: Scene;
  balances: Balances;
  /** The figure a full tank stands for. */
  scaleMax: Paise;
  /** The changes of the last step, shown beside the bands they moved. */
  changes: readonly BandChange[];
  /** The places a movement is coming from or going to just now. */
  focus: readonly Spot[];
  reduced: boolean;
  /** The phone layout: smaller tanks, Assets on a row of its own. */
  compact: boolean;
}

export const Tanks = forwardRef<TanksHandle, Props>(function Tanks({ scene, balances, scaleMax, changes, focus, reduced, compact }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const values = useMemo(() => bandValues(scene, balances), [scene, balances]);
  const totals = useMemo(() => totalsOf(scene, balances), [scene, balances]);
  const focused = new Set(focus.map(spotKey));

  useImperativeHandle(
    ref,
    () => ({
      fly(moves, ms) {
        const box = root.current;
        const host = layer.current;
        if (reduced || !box || !host || moves.length === 0 || typeof Element === 'undefined' || !('animate' in Element.prototype)) return Promise.resolve();
        const origin = box.getBoundingClientRect();
        const centre = (s: Spot) => {
          const el = box.querySelector<HTMLElement>(`[data-spot="${spotKey(s)}"]`);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2 - origin.left, y: r.top + r.height / 2 - origin.top };
        };
        const flights: Promise<unknown>[] = [];
        for (const move of moves) {
          const from = centre(move.from);
          const to = centre(move.to);
          if (!from || !to) continue;
          // Three coins a move, a little apart: few enough to stay smooth on a budget phone.
          for (let i = 0; i < 3; i++) {
            const coin = document.createElement('span');
            coin.className = 'sim-coin';
            coin.setAttribute('aria-hidden', 'true');
            host.appendChild(coin);
            const lift = Math.min(60, Math.abs(to.x - from.x) / 4 + 24);
            const midX = (from.x + to.x) / 2;
            const midY = Math.min(from.y, to.y) - lift;
            const anim = coin.animate(
              [
                { transform: `translate(${from.x}px, ${from.y}px) scale(0.5)`, opacity: 0 },
                { transform: `translate(${from.x}px, ${from.y}px) scale(1)`, opacity: 1, offset: 0.12 },
                { transform: `translate(${midX}px, ${midY}px) scale(1.1)`, opacity: 1, offset: 0.55 },
                { transform: `translate(${to.x}px, ${to.y}px) scale(0.8)`, opacity: 1, offset: 0.92 },
                { transform: `translate(${to.x}px, ${to.y}px) scale(0.4)`, opacity: 0 },
              ],
              { duration: ms, delay: i * (ms / 9), easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' },
            );
            flights.push(anim.finished.catch(() => undefined).finally(() => coin.remove()));
          }
        }
        // A page that is not being drawn (a hidden tab) does not move its animations on: the step goes on all the
        // same once its time is up, and coins still in the air are taken away.
        const late = new Promise<void>((done) => window.setTimeout(done, ms * 1.5 + 250));
        return Promise.race([Promise.all(flights), late]).then(() => {
          for (const coin of host.querySelectorAll('.sim-coin')) coin.remove();
        });
      },
    }),
    [reduced],
  );

  // The order the containers stand in: the left of the equation, then the right, each Suspense on the side of its balance.
  const byId = (id: string) => scene.containers.find((c) => c.id === id)!;
  const either = scene.containers.filter((c) => c.side === 'either' && totals.containers[c.id] !== 0);
  const left = [...scene.equation.left.map(byId), ...either.filter(() => totals.suspense?.side === 'left')];
  const right = [...scene.equation.right.map(byId), ...either.filter(() => totals.suspense?.side === 'right')];
  const height = compact ? 150 : 250;

  const tank = (c: ContainerSpec, wide: boolean) => (
    <Tank key={c.id} scene={scene} container={c} values={values} total={totals.containers[c.id] ?? 0} scaleMax={scaleMax} height={height} changes={changes} focused={focused} reduced={reduced} wide={wide} narrow={compact && !wide} />
  );
  const sign = (s: string, key: string, wide = false) => (
    <span key={key} aria-hidden="true" className={`flex items-center justify-center text-3xl font-extrabold text-muted ${wide ? 'basis-full py-0' : 'self-center px-1'}`}>
      {s}
    </span>
  );

  return (
    <div ref={root} className="relative">
      <p data-spot="outside" className="mx-auto mb-2 w-fit rounded-full border border-dashed border-edge-deep px-3 py-1 text-xs font-bold text-muted">
        Outside the business
      </p>
      <div data-testid="sim-tanks" className={`flex ${compact ? 'flex-wrap' : 'flex-nowrap'} items-stretch justify-center gap-x-2 gap-y-1`}>
        {left.map((c, i) => (
          <Fragment key={c.id}>
            {i > 0 ? sign('+', `l${i}`) : null}
            {tank(c, compact)}
          </Fragment>
        ))}
        {sign(totals.balanced ? '=' : '≠', 'eq', compact)}
        {right.map((c, i) => (
          <Fragment key={c.id}>
            {i > 0 ? sign('+', `r${i}`) : null}
            {tank(c, false)}
          </Fragment>
        ))}
      </div>
      <div ref={layer} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible" />
    </div>
  );
});

function Tank({
  scene,
  container,
  values,
  total,
  scaleMax,
  height,
  changes,
  focused,
  reduced,
  wide,
  narrow,
}: {
  scene: Scene;
  container: ContainerSpec;
  values: Record<string, Paise>;
  total: Paise;
  scaleMax: Paise;
  height: number;
  changes: readonly BandChange[];
  focused: ReadonlySet<string>;
  reduced: boolean;
  wide: boolean;
  /** On a phone: wide enough for two to a row, so that a third (Suspense) goes to a row of its own. */
  narrow: boolean;
}) {
  const hue = HUE[container.hue];
  const bands = scene.bands.filter((b) => b.container === container.id);
  const px = (v: Paise) => (scaleMax > 0 ? Math.min(height, (Math.abs(v) / scaleMax) * height) : 0);
  // Positive bands stack up from the bottom; a deduction (drawings, a loss, a provision) eats into the top of them.
  const stack = bands.reduce<{ band: (typeof bands)[number]; v: Paise; h: number; at: number; shade: string }[]>((list, b, i) => {
    const v = values[b.id] ?? 0;
    const below = list.at(-1);
    list.push({ band: b, v, h: v > 0 ? px(v) : 0, at: below ? below.at + below.h : 0, shade: hue.shades[i % hue.shades.length] });
    return list;
  }, []);
  const top = stack.at(-1);
  const bottom = top ? top.at + top.h : 0;
  const level = px(Math.max(0, total));
  const deductions = stack.filter((s) => s.v < 0);
  const moved = new Map(changes.filter((c) => c.container === container.id).map((c) => [c.band, c.delta]));
  const transition = reduced ? 'transition-opacity duration-300' : 'transition-transform duration-500 ease-out';
  const shown = stack.filter((s) => s.v !== 0);

  return (
    <section
      aria-labelledby={`tank-${container.id}`}
      data-testid={`tank-${container.id}`}
      className={`flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card ${wide ? 'basis-full' : narrow ? 'min-w-[8rem] flex-1 basis-0' : 'flex-1 basis-0'}`}
    >
      <header className="flex flex-col">
        <h3 id={`tank-${container.id}`} className={`text-base font-extrabold ${hue.ink}`}>
          {container.title}
        </h3>
        <p className="text-xs text-muted">{container.caption}</p>
        <p data-testid={`tank-${container.id}-total`} className="text-xl font-extrabold tabular-nums">
          {formatINR(total)}
        </p>
      </header>

      {/* The tank: a glass box with a rim, the liquid in bands, a surface at the level. Decorative: the list below says it all. */}
      <div aria-hidden="true" className="relative mx-auto w-full max-w-56" style={{ height: height + 7 }}>
        <div className="absolute inset-x-0 bottom-0 overflow-hidden rounded-b-[1.4rem] border-2 border-t-0 border-edge-deep bg-sunken" style={{ top: 7 }}>
          {/* An empty band is drawn too, flat: it is where coins land when it begins to fill. */}
          {stack
            .filter((s) => s.v >= 0)
            .map((s) => (
            <div
              key={s.band.id}
              data-spot={`${container.id}:${s.band.id}`}
              className={`absolute inset-x-0 top-0 origin-bottom ${s.shade} ${transition} ${focused.has(`${container.id}:${s.band.id}`) ? 'brightness-110' : ''}`}
              style={{ height, transform: `translateY(${-s.at}px) scaleY(${height > 0 ? s.h / height : 0})`, opacity: s.h > 0 ? 1 : 0 }}
            />
            ))}
          {deductions.map((s) => {
            const h = Math.min(px(s.v), bottom);
            return (
              <div
                key={s.band.id}
                data-spot={`${container.id}:${s.band.id}`}
                className={`sim-deduction absolute inset-x-0 top-0 origin-bottom ${transition}`}
                style={{ height, transform: `translateY(${-(bottom - h)}px) scaleY(${height > 0 ? h / height : 0})` }}
              />
            );
          })}
          {/* The surface of the liquid: a flat ellipse at the level, for depth. */}
          <div className={`absolute inset-x-1 top-0 h-3 rounded-[50%] border border-white/40 ${hue.shades[0]} ${transition}`} style={{ transform: `translateY(${height - level - 6}px)`, opacity: level > 0 ? 0.9 : 0 }} />
        </div>
        {/* The rim at the top of the tank. */}
        <div className="absolute inset-x-0 top-0 h-3.5 rounded-[50%] border-2 border-edge-deep bg-surface/60" />
      </div>

      <dl data-testid={`tank-${container.id}-bands`} className="flex flex-col gap-0.5 text-sm">
        {shown.length === 0 ? <p className="text-muted">Nothing yet</p> : null}
        {shown.map((s) => {
          const delta = moved.get(s.band.id);
          return (
            <div key={s.band.id} data-testid={`band-${s.band.id}`} className={`flex flex-wrap items-baseline justify-between gap-x-2 rounded px-1 ${focused.has(`${container.id}:${s.band.id}`) ? hue.soft : ''}`}>
              <dt className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${s.v < 0 ? 'sim-deduction' : s.shade}`} />
                <span>{s.band.label}</span>
              </dt>
              <dd className="ml-auto flex shrink-0 flex-wrap items-baseline justify-end gap-x-1.5 tabular-nums">
                {delta ? (
                  <span data-testid={`band-${s.band.id}-delta`} className={`text-xs font-extrabold ${delta > 0 ? 'text-primary-ink' : 'text-danger-deep'}`}>
                    {delta > 0 ? '▲' : '▼'} {signed(delta)}
                  </span>
                ) : null}
                <span className="font-bold">{s.v < 0 ? `(${formatINR(-s.v)})` : formatINR(s.v)}</span>
              </dd>
            </div>
          );
        })}
        {/* A band that has just emptied still says so. */}
        {[...moved]
          .filter(([id]) => (values[id] ?? 0) === 0)
          .map(([id, delta]) => (
            <div key={id} className="flex items-baseline justify-between gap-2 px-1 text-muted">
              <dt>{bands.find((b) => b.id === id)?.label}</dt>
              <dd className="text-xs font-extrabold">
                ▼ {signed(delta)} · {formatINR(0)}
              </dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
