'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { useMediaQuery } from '@/components/ui/useMediaQuery';
import { bandValues, totalsOf } from '@/simulator/engine';
import { balanceWords, equationLine, stepAnnouncement } from '@/simulator/explain';
import type { Scene } from '@/simulator/scenes';
import type { Balances, BandChange, Paise, Played, Spot, Totals } from '@/simulator/types';
import { Tanks, type TanksHandle } from './Tanks';
import { useReducedMotion } from './useReducedMotion';

// ---------------------------------------------------------------------------------------------------------------
// The stage: the tanks, the equation under them, and the playback of one transaction step by step, with its
// controls (play, pause, step, replay, speed) and a polite announcement of every step for a screen reader.
// ---------------------------------------------------------------------------------------------------------------

export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

/** The figure a full tank stands for over a whole play: the largest stack it reaches, with room above. */
function scaleFor(scene: Scene, books: readonly Balances[]): Paise {
  let top = 0;
  for (const b of books) {
    const v = bandValues(scene, b);
    for (const c of scene.containers) {
      const sum = scene.bands.filter((band) => band.container === c.id).reduce((s, band) => s + Math.max(0, v[band.id]), 0);
      top = Math.max(top, sum);
    }
  }
  const room = Math.max(top * 1.15, 1_000_000);
  // A round figure, so that the scale does not jitter from one transaction to the next.
  const step = 10 ** Math.floor(Math.log10(room)) / 2;
  return Math.ceil(room / step) * step;
}

/** The changes of the steps that have played, added up band by band. */
function changesSoFar(played: Played, shown: number): BandChange[] {
  const out = new Map<string, BandChange>();
  for (const s of played.steps.slice(0, shown)) {
    for (const c of s.changes) {
      const key = `${c.container}:${c.band}`;
      const prev = out.get(key);
      out.set(key, { ...c, delta: (prev?.delta ?? 0) + c.delta });
    }
  }
  return [...out.values()].filter((c) => c.delta !== 0);
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'done';

export function SimStage({
  scene,
  played,
  autoStart = true,
  onDone,
  speed,
  onSpeed,
  caption,
}: {
  scene: Scene;
  /** What to play. A new one (a new object) starts a new playback. */
  played: Played;
  autoStart?: boolean;
  onDone?: () => void;
  speed: Speed;
  onSpeed(s: Speed): void;
  /** A line above the tanks: what is being played. */
  caption?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const compact = !useMediaQuery('(min-width: 640px)', true);
  const tanks = useRef<TanksHandle>(null);
  const [shown, setShown] = useState(0);
  const [moving, setMoving] = useState<number | null>(null);
  const [chosen, setStatus] = useState<PlaybackStatus>(autoStart ? 'playing' : 'idle');
  const [announcement, setAnnouncement] = useState('');
  const run = useRef(0);
  const n = played.steps.length;
  const latestDone = useRef(onDone);
  useEffect(() => {
    latestDone.current = onDone;
  });

  // A new transaction: back to its start.
  const [current, setCurrent] = useState(played);
  if (current !== played) {
    setCurrent(played);
    setShown(0);
    setMoving(null);
    setStatus(autoStart ? 'playing' : 'idle');
  }

  // In the render that meets a new transaction, the state above is still the old one's: it is read as at the start.
  const stale = current !== played;
  const shownNow = stale ? 0 : Math.min(shown, n);
  const movingNow = stale ? null : moving;
  // Playing with nothing left to play is done.
  const status: PlaybackStatus = stale ? (autoStart ? 'playing' : 'idle') : chosen === 'playing' && moving === null && shown >= n ? 'done' : chosen;
  const flyMs = (reduced ? 0 : 1100) / speed;
  const gapMs = (reduced ? 900 : 450) / speed;

  const playStep = useCallback(
    async (i: number, token: number) => {
      setMoving(i);
      await tanks.current?.fly(played.steps[i].moves, flyMs);
      if (run.current !== token) return;
      setShown(i + 1);
      setMoving(null);
      setAnnouncement(stepAnnouncement(scene, played.steps[i].text, played.steps[i].totals));
    },
    [played, flyMs, scene],
  );

  // Playing: the next step after a short pause, until the last.
  useEffect(() => {
    if (status !== 'playing' || moving !== null) return;
    const token = ++run.current;
    let started = false;
    const timer = window.setTimeout(
      () => {
        started = true;
        void playStep(shown, token);
      },
      shown === 0 ? 150 : gapMs,
    );
    // A step that has begun runs to its end (a pause stops after it); one still waiting is called off.
    return () => {
      if (!started) window.clearTimeout(timer);
    };
  }, [status, moving, shown, n, gapMs, playStep]);

  // A step in flight when the transaction changes (or the stage goes) is forgotten.
  useEffect(
    () => () => {
      run.current++;
    },
    [played],
  );

  useEffect(() => {
    if (status === 'done') latestDone.current?.();
  }, [status]);

  const play = () => setStatus(shown >= n ? 'done' : 'playing');
  const pause = () => setStatus('paused');
  const step = () => {
    if (moving !== null || shown >= n) return;
    setStatus('paused');
    const token = ++run.current;
    void playStep(shown, token).then(() => {
      if (shown + 1 >= n) setStatus('done');
    });
  };
  const replay = () => {
    run.current++;
    setMoving(null);
    setShown(0);
    setAnnouncement('Playing again from the start.');
    setStatus('playing');
  };

  const books: Balances = shownNow === 0 ? played.before : played.steps[shownNow - 1].balances;
  const totals = useMemo(() => totalsOf(scene, books), [scene, books]);
  const scaleMax = useMemo(() => scaleFor(scene, [played.before, ...played.steps.map((s) => s.balances)]), [scene, played]);
  const changes = useMemo(() => changesSoFar(played, shownNow), [played, shownNow]);
  const focus: Spot[] = movingNow === null ? [] : played.steps[movingNow].moves.flatMap((m) => [m.from, m.to]).filter((s) => s !== 'outside');

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      if (status === 'playing') pause();
      else play();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      step();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      replay();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {caption}
      <div
        tabIndex={0}
        role="group"
        aria-label="The books. Space plays or pauses, the right arrow plays one step, R plays again."
        aria-keyshortcuts="Space ArrowRight R"
        onKeyDown={onKey}
        data-testid="sim-stage"
        data-status={status}
        data-shown={shownNow}
        className="rounded-panel border border-edge bg-canvas p-3 outline-none focus-visible:ring-4 focus-visible:ring-focus sm:p-4"
      >
        <Tanks ref={tanks} scene={scene} balances={books} scaleMax={scaleMax} changes={changes} focus={focus} reduced={reduced} compact={compact} />
        <EquationBar scene={scene} totals={totals} />
      </div>

      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Playback">
        {status === 'playing' ? (
          <Button variant="secondary" data-testid="sim-pause" onClick={pause}>
            Pause
          </Button>
        ) : (
          <Button variant="secondary" data-testid="sim-play" onClick={play} disabled={shownNow >= n}>
            Play
          </Button>
        )}
        <Button variant="secondary" data-testid="sim-step" onClick={step} disabled={movingNow !== null || shownNow >= n}>
          Step
        </Button>
        <Button variant="secondary" data-testid="sim-replay" onClick={replay}>
          Replay
        </Button>
        <div role="group" aria-label="Speed" className="ml-auto flex items-center gap-1">
          <span className="text-sm font-bold text-muted">Speed</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              data-testid={`sim-speed-${s}`}
              onClick={() => onSpeed(s)}
              className={`min-h-9 min-w-11 rounded-full border px-2 text-sm font-extrabold ${speed === s ? 'border-primary bg-primary text-white' : 'border-edge-deep bg-surface text-ink hover:bg-sunken'}`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <ol data-testid="sim-steps" aria-label="Steps" className="flex flex-col gap-1.5">
        {played.steps.map((s, i) => (
          <li
            key={i}
            data-testid="sim-step-text"
            data-played={i < shownNow ? 'true' : 'false'}
            className={`rounded-control border px-3 py-2 text-sm ${i < shownNow ? 'border-edge bg-surface' : i === movingNow ? 'border-primary bg-primary-soft' : 'border-dashed border-edge text-muted'}`}
          >
            <span className="font-extrabold">Step {i + 1}{s.equationOnly ? ' (the equation only)' : ''}: </span>
            {i < shownNow || i === movingNow ? s.text : 'Waiting to play.'}
          </li>
        ))}
      </ol>

      <p role="status" aria-live="polite" data-testid="sim-announce" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** "Assets ₹X = Liabilities ₹Y + Capital ₹Z" with a balance that tips when the two sides differ. */
export function EquationBar({ scene, totals }: { scene: Scene; totals: Totals }) {
  const diff = totals.left - totals.right;
  const tilt = diff === 0 ? 0 : diff > 0 ? -8 : 8;
  return (
    <div data-testid="sim-equation" data-balanced={totals.balanced ? 'true' : 'false'} className="mt-3 flex flex-col items-center gap-1 text-center">
      <div className="flex items-center gap-3">
        <svg width="56" height="28" viewBox="0 0 56 28" aria-hidden="true" className="shrink-0">
          <path d="M28 26 L22 26 L28 16 L34 26 Z" className="fill-edge-deep" />
          <g style={{ transform: `rotate(${tilt}deg)`, transformOrigin: '28px 15px', transition: 'transform 400ms ease-out' }}>
            <rect x="4" y="13" width="48" height="4" rx="2" className={totals.balanced ? 'fill-primary' : 'fill-danger'} />
            <circle cx="8" cy="10" r="4" className="fill-hue-blue" />
            <circle cx="48" cy="10" r="4" className="fill-hue-green" />
          </g>
        </svg>
        <p data-testid="sim-equation-line" className="text-base font-extrabold tabular-nums sm:text-lg">
          {equationLine(scene, totals)}
        </p>
      </div>
      <p data-testid="sim-balance" className={`text-sm font-extrabold ${totals.balanced ? (totals.suspense ? 'text-accent-ink' : 'text-primary-ink') : 'text-danger-deep'}`}>
        {totals.balanced ? (totals.suspense ? '⚠ ' : '✓ ') : '✗ '}
        {balanceWords(totals)}
      </p>
    </div>
  );
}
