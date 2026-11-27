'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { SPEEDS, type Playback } from './usePlayback';

// ---------------------------------------------------------------------------------------------------------------
// The frame of every walk-through: the picture (focusable, with its keys), the playback bar, the step being told,
// the steps as a list, and a polite announcement of each step for a screen reader. Test ids begin with the lab's
// prefix: <prefix>-stage, -play, -pause, -back, -step, -replay, -speed-<s>, -progress, -now, -steps, -step-text,
// -announce.
// ---------------------------------------------------------------------------------------------------------------

const KEYS = 'Space plays or pauses, the arrows step on or back, R plays again.';

/**
 * The picture of a walk-through. With `playback` it takes the keys (Space, the arrows, R) when it has the focus,
 * and says how far the walk-through has got (`data-shown`, `data-status`); without it, it only frames the picture.
 */
export function Stage({
  prefix,
  label,
  playback,
  shown,
  children,
  className = '',
  ...data
}: {
  prefix: string;
  /** What the picture shows, for a screen reader. */
  label: string;
  playback?: Playback;
  /** Steps shown, for a picture without playback. */
  shown?: number;
  children: ReactNode;
  className?: string;
  /** Anything else the picture says about itself (`data-answered`). */
  [data: `data-${string}`]: string | number | undefined;
}) {
  const frame = `relative min-w-0 rounded-panel border border-edge bg-canvas p-2 sm:p-3 ${className}`;
  if (!playback) {
    return (
      <div role="group" aria-label={label} data-testid={`${prefix}-stage`} data-shown={shown} className={frame} {...data}>
        {children}
      </div>
    );
  }
  return (
    <div
      {...data}
      tabIndex={0}
      role="group"
      aria-label={`${label}. ${KEYS}`}
      aria-keyshortcuts="Space ArrowRight ArrowLeft R"
      onKeyDown={playback.onKey}
      data-testid={`${prefix}-stage`}
      data-shown={playback.shown}
      data-status={playback.status}
      className={`${frame} outline-none focus-visible:ring-4 focus-visible:ring-focus`}
    >
      {children}
    </div>
  );
}

/**
 * Play or pause, back, step, replay, how far it has got, and the speed; with `announce`, the polite announcement of
 * the step just played.
 */
export function PlaybackBar({ playback, prefix, announce }: { playback: Playback; prefix: string; announce?: string; /** Not needed: the playback knows its count. Kept so that older callers still build. */ count?: number }) {
  const { shown, count, status, moving, speed } = playback;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div role="toolbar" aria-label="Playback" className="flex flex-wrap items-center gap-2">
        {status === 'playing' ? (
          <Button data-testid={`${prefix}-pause`} aria-keyshortcuts="Space" onClick={playback.pause}>
            <span aria-hidden="true">❚❚</span> Pause
          </Button>
        ) : (
          <Button data-testid={`${prefix}-play`} aria-keyshortcuts="Space" onClick={playback.play}>
            <span aria-hidden="true">▶</span> {shown >= count ? 'Play again' : shown <= playback.floor ? 'Play' : 'Play on'}
          </Button>
        )}
        <Button variant="secondary" data-testid={`${prefix}-back`} aria-keyshortcuts="ArrowLeft" onClick={playback.back} disabled={shown <= playback.floor && moving === null}>
          <span aria-hidden="true">◀</span> Back
        </Button>
        <Button variant="secondary" data-testid={`${prefix}-step`} aria-keyshortcuts="ArrowRight" onClick={playback.step} disabled={moving !== null || shown >= count}>
          Step <span aria-hidden="true">▶</span>
        </Button>
        <Button variant="secondary" data-testid={`${prefix}-replay`} aria-keyshortcuts="R" onClick={playback.replay}>
          <span aria-hidden="true">↺</span> Replay
        </Button>
        <span data-testid={`${prefix}-progress`} className="text-sm font-bold text-muted tabular-nums">
          Step {shown} of {count}
        </span>
        <div role="group" aria-label="Speed" className="flex items-center gap-1 sm:ml-auto">
          <span className="text-sm font-bold text-muted">Speed</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              data-testid={`${prefix}-speed-${s}`}
              onClick={() => playback.setSpeed(s)}
              className={`min-h-11 min-w-11 rounded-full border px-2 text-sm font-extrabold ${speed === s ? 'border-primary bg-primary text-white' : 'border-edge-deep bg-surface text-ink hover:bg-sunken'}`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
      <p className="hidden text-xs text-muted sm:block">With the picture in focus: {KEYS}</p>
      {announce !== undefined ? <Announce text={announce} prefix={prefix} /> : null}
    </div>
  );
}

/** The step just played, told in words: "Step 3 of 8: title", then what happened; before the first, how to start. */
export function StepNow({ prefix, at, count, title, idle, children, live = false }: { prefix: string; at: number; count: number; title?: ReactNode; idle: ReactNode; children?: ReactNode; live?: boolean }) {
  return (
    <div
      data-testid={`${prefix}-now`}
      data-step={at}
      aria-live={live ? 'polite' : undefined}
      className={`flex min-h-20 min-w-0 flex-col gap-1 rounded-card border-2 px-4 py-3 ${at > 0 ? 'border-primary bg-primary-soft' : 'border-dashed border-edge-deep bg-surface'}`}
    >
      {at > 0 ? (
        <>
          <p className="text-xs font-extrabold uppercase tracking-wide text-primary-ink">
            Step {at} of {count}
            {title ? <>: {title}</> : null}
          </p>
          <div className="text-base text-ink">{children}</div>
        </>
      ) : (
        <div className="text-base text-muted">{idle}</div>
      )}
    </div>
  );
}

/**
 * The steps of a walk-through as a list: those played say what happened, the next ones wait. With `onPick` each is
 * a button that goes to it.
 */
export function StepList({
  steps,
  shown,
  prefix,
  label = 'Steps',
  onPick,
}: {
  steps: readonly { title: ReactNode; text?: ReactNode }[];
  shown: number;
  prefix: string;
  label?: string;
  /** Go to step i (0-based): show it and everything before it. */
  onPick?(i: number): void;
}) {
  return (
    <ol aria-label={label} data-testid={`${prefix}-steps`} className="flex flex-col gap-1.5">
      {steps.map((s, i) => {
        const look = `rounded-control border px-3 py-2 text-left text-sm ${i === shown - 1 ? 'border-primary bg-primary-soft' : i < shown ? 'border-edge bg-surface' : 'border-dashed border-edge text-muted'}`;
        const body = (
          <>
            <span className="font-extrabold">
              {i + 1}. {s.title}
              {i < shown && s.text ? ': ' : ''}
            </span>
            {i < shown ? s.text : <span className="sr-only">: waiting to play.</span>}
          </>
        );
        return (
          <li key={i} data-testid={`${prefix}-step-text`} data-played={i < shown ? 'true' : 'false'} aria-current={i === shown - 1 ? 'step' : undefined} className={onPick ? '' : look}>
            {onPick ? (
              <button type="button" onClick={() => onPick(i)} className={`min-h-11 w-full ${look} hover:border-primary`}>
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The polite announcement of the step just played, for a screen reader. */
export function Announce({ text, prefix }: { text: string; prefix: string }) {
  return (
    <p role="status" aria-live="polite" data-testid={`${prefix}-announce`} className="sr-only">
      {text}
    </p>
  );
}
