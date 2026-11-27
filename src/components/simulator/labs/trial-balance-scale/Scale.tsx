'use client';

import type { Side } from '@/engine/accounts';
import { formatINR } from '@/engine/money';
import type { Frame } from '@/simulator/trial-balance-scale/scale';

// ---------------------------------------------------------------------------------------------------------------
// The scale: a beam on a post, the Debit pan hanging on the left and the Credit pan on the right, each holding its
// accounts as labelled weights. The beam tips toward the heavier pan; a Suspense weight (hatched) levels it. Drawn
// in HTML and CSS: the beam turns and the pans move by transform only, in units of the scale's own width (cqw), so
// the pans stay on the ends of the beam at every width.
// ---------------------------------------------------------------------------------------------------------------

export const S = 'lab-trial-balance-scale';
const ANGLE = 10;
/** How far a pan moves when the beam turns: a quarter of the width (its arm) times the sine of the angle, in cqw. */
const DROP = 25 * Math.sin((ANGLE * Math.PI) / 180);
const PAN_H = 300;
const BEAM_Y = 30;

/** Suspense is hatched, so that it is told from the accounts without its colour. */
const HATCH = { background: 'repeating-linear-gradient(135deg, var(--color-accent) 0 3px, transparent 3px 8px), var(--color-accent-soft)' };

const sideName = (s: Side) => (s === 'Dr' ? 'Debit' : 'Credit');

export function ScalePicture({ frame, prev, reduced }: { frame: Frame; prev?: Frame | null; reduced: boolean }) {
  const turn = frame.tilt === 'level' ? 0 : frame.tilt === 'Dr' ? -ANGLE : ANGLE;
  const drop = (s: Side) => (frame.tilt === 'level' ? 0 : frame.tilt === s ? DROP : -DROP);
  const move = reduced ? '' : 'transition-transform duration-700 ease-out';
  const verdict =
    frame.tilt === 'level'
      ? frame.suspense
        ? `Level, with Suspense A/c ${formatINR(frame.suspense.amount)} on the ${sideName(frame.suspense.side).toLowerCase()} side`
        : 'Level: debits equal credits'
      : `Tipped: the ${sideName(frame.tilt).toLowerCase()} side is heavier by ${formatINR(Math.abs(frame.debit - frame.credit))}`;
  return (
    <figure data-testid={`${S}-scale`} data-tilt={frame.tilt} className="mx-auto flex w-full max-w-3xl flex-col gap-2" style={{ containerType: 'inline-size' }}>
      <div className="relative" style={{ height: BEAM_Y + PAN_H + 24 }} aria-hidden="true">
        {/* The post and its foot. */}
        <div className="absolute bottom-0 left-1/2 w-2.5 -translate-x-1/2 rounded-t bg-edge-deep" style={{ top: BEAM_Y }} />
        <div className="absolute bottom-0 left-1/2 h-3 w-28 -translate-x-1/2 rounded-t-lg bg-edge-deep" />
        {/* The beam, with a pointer that leans with it. */}
        <div className={`absolute left-1/4 h-2.5 w-1/2 origin-center rounded-full bg-ink/70 ${move}`} style={{ top: BEAM_Y - 5, transform: `rotate(${turn}deg)` }}>
          <div className={`absolute bottom-full left-1/2 h-6 w-1 -translate-x-1/2 rounded-full ${frame.tilt === 'level' ? 'bg-primary' : 'bg-danger'}`} />
        </div>
        <div className="absolute left-1/2 h-5 w-5 -translate-x-1/2 rounded-full border-4 border-edge-deep bg-surface" style={{ top: BEAM_Y - 10 }} />
        {(['Dr', 'Cr'] as const).map((s) => (
          <div key={s} className={`absolute w-1/2 ${s === 'Dr' ? 'left-0' : 'left-1/2'} ${move}`} style={{ top: BEAM_Y, height: PAN_H, transform: `translateY(${drop(s)}cqw)` }}>
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="50" y1="0" x2="8" y2="100" className="stroke-edge-deep" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <line x1="50" y1="0" x2="92" y2="100" className="stroke-edge-deep" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="absolute inset-x-[6%] bottom-0 flex flex-col justify-end">
              <Pan side={s} frame={frame} prev={prev ?? null} />
              <div className="h-3 rounded-b-full border-2 border-t-0 border-edge-deep bg-sunken" />
            </div>
          </div>
        ))}
      </div>
      <figcaption className="grid grid-cols-2 gap-2 text-center">
        <p className="text-sm font-bold">
          Debit side
          <span data-testid={`${S}-debit-total`} className="block text-lg font-extrabold tabular-nums">
            {formatINR(frame.debit)}
          </span>
        </p>
        <p className="text-sm font-bold">
          Credit side
          <span data-testid={`${S}-credit-total`} className="block text-lg font-extrabold tabular-nums">
            {formatINR(frame.credit)}
          </span>
        </p>
        <p data-testid={`${S}-verdict`} className={`col-span-2 text-sm font-extrabold ${frame.tilt === 'level' ? (frame.suspense ? 'text-accent-ink' : 'text-primary-ink') : 'text-danger-deep'}`}>
          {frame.tilt === 'level' ? (frame.suspense ? '⚠ ' : '✓ ') : '✗ '}
          {verdict}
        </p>
      </figcaption>
      <PanList frame={frame} />
    </figure>
  );
}

/** The weights on one pan, Suspense on top when it is there (and fading out as it leaves). */
function Pan({ side, frame, prev }: { side: Side; frame: Frame; prev: Frame | null }) {
  const weights = frame.weights.filter((w) => w.side === side);
  const here = frame.suspense?.side === side ? frame.suspense : null;
  const leaving = !here && prev?.suspense?.side === side ? prev.suspense : null;
  const shown = here ?? leaving;
  return (
    <div className="flex flex-col gap-1 pb-1">
      {shown ? (
        <div
          data-testid={here ? `${S}-suspense` : undefined}
          style={HATCH}
          className={`rounded-md border-2 border-accent-deep px-1.5 py-1 text-center text-[11px] font-extrabold text-accent-ink transition-[transform,opacity] duration-500 starting:-translate-y-10 starting:opacity-0 sm:text-xs ${leaving ? '-translate-y-10 opacity-0' : ''}`}
        >
          <span className="rounded bg-surface/85 px-1">
            Suspense A/c <span className="tabular-nums">{formatINR(shown.amount)}</span>
          </span>
        </div>
      ) : null}
      {[...weights].reverse().map((w) => (
        <div
          key={w.accountId}
          className={`flex flex-wrap items-baseline justify-between gap-x-1 rounded-md border px-1.5 py-1 text-[11px] leading-tight transition-colors sm:text-xs ${side === 'Dr' ? 'border-hue-blue/50 bg-hue-blue-soft' : 'border-hue-teal/50 bg-hue-teal-soft'} ${w.delta !== 0 ? 'ring-2 ring-accent' : ''}`}
        >
          <span className="min-w-0 font-bold">{w.title}</span>
          <span className="tabular-nums">
            {w.delta !== 0 ? <span className={`mr-1 font-extrabold ${w.delta > 0 ? 'text-primary-ink' : 'text-danger-deep'}`}>{w.delta > 0 ? '▲' : '▼'}</span> : null}
            {formatINR(w.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The same weights in words, for a screen reader and for anyone who prefers a list. */
function PanList({ frame }: { frame: Frame }) {
  const list = (s: Side) => [
    ...frame.weights.filter((w) => w.side === s).map((w) => ({ key: w.accountId, text: `${w.title} ${formatINR(w.amount)}${w.delta ? ` (${w.delta > 0 ? 'up' : 'down'} ${formatINR(Math.abs(w.delta))})` : ''}` })),
    ...(frame.suspense?.side === s ? [{ key: 'suspense', text: `Suspense A/c ${formatINR(frame.suspense.amount)}` }] : []),
  ];
  return (
    <div className="sr-only">
      {(['Dr', 'Cr'] as const).map((s) => (
        <ul key={s} aria-label={`${sideName(s)} pan`}>
          {list(s).map((i) => (
            <li key={i.key} data-testid={`${S}-weight-${i.key}`}>
              {i.text}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
