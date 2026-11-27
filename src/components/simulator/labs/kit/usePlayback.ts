'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';

// ---------------------------------------------------------------------------------------------------------------
// The playback of every lab's walk-through: how many of its steps are shown, and play, pause, step, back, replay
// and the speed. Steps are moments of a story (a year of an asset, a line posted, an item carried into a
// statement); the screen draws the story as it stands after `shown` of them. A new story (a new `story` value)
// starts again from `start` (0, or the end for a sandbox that shows everything at once).
//
// A step may be animated: `run(i)` plays its animation and resolves when it has landed (at once with reduced
// motion); while it runs, `moving` is i, and only then does the step count as shown. Without `run` a step is shown
// at once, and the picture moves on its own (by `advanced`, the step just reached by going forward one at a time).
// ---------------------------------------------------------------------------------------------------------------

export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];
export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'done';

export interface Playback {
  /** Steps shown so far, 0 to `count`. */
  shown: number;
  count: number;
  /** The fewest steps ever shown: Back and Replay go no further back. */
  floor: number;
  status: PlaybackStatus;
  /** The step being animated now (see `run`), or null. */
  moving: number | null;
  /** The step last reached by going forward one at a time (for its animation); null after a jump back or a replay. */
  advanced: number | null;
  speed: Speed;
  setSpeed(s: Speed): void;
  play(): void;
  pause(): void;
  step(): void;
  back(): void;
  replay(): void;
  /** Show this many steps, and stop. */
  seek(n: number): void;
  /** Space plays or pauses, the right arrow steps on, the left arrow steps back, R replays (on the element itself). */
  onKey(e: KeyboardEvent<HTMLElement>): void;
}

export interface PlaybackOptions {
  /** What is played: a new value starts again from `start`. */
  story: unknown;
  /** The pause at 1x before the next step, in ms; or, given the steps shown, the time to read the last of them. */
  stepMs: number | ((shown: number) => number);
  /** Where a new story starts: 0, or more than `count` for everything at once. */
  start?: number;
  /** Steps that are always shown (a walk-through that carries on from what was done by hand). */
  floor?: number;
  /** Animates step i (resolves when it has landed). */
  run?: (i: number, speed: Speed) => Promise<void>;
}

interface Position {
  shown: number;
  advanced: number | null;
}

export function usePlayback(count: number, { story, stepMs, start = 0, floor: least = 0, run }: PlaybackOptions): Playback {
  const [current, setCurrent] = useState(story);
  const [pos, setPos] = useState<Position>({ shown: start, advanced: null });
  const [chosen, setChosen] = useState<PlaybackStatus>('idle');
  const [moving, setMoving] = useState<number | null>(null);
  const [speed, setSpeed] = useState<Speed>(1);
  // Each step in flight carries the token it began with: anything that moves the walk-through elsewhere takes a
  // new one, and a step whose token is stale is forgotten when it lands.
  const token = useRef(0);
  const latest = useRef({ run, stepMs, speed });
  useEffect(() => {
    latest.current = { run, stepMs, speed };
  });

  // Something new to play: back to its start (adjusted while rendering, as React advises for state that follows a prop).
  if (current !== story) {
    setCurrent(story);
    setPos({ shown: start, advanced: null });
    setChosen('idle');
    setMoving(null);
  }
  const stale = current !== story;
  const floor = Math.min(least, count);
  const shown = Math.min(stale ? start : pos.shown, count);
  const advanced = stale ? null : pos.advanced;
  const movingNow = stale ? null : moving;
  const status: PlaybackStatus = shown >= count && movingNow === null ? 'done' : stale ? 'idle' : chosen;

  useEffect(
    () => () => {
      token.current++;
    },
    [story],
  );

  /** Plays step i: animated first if the lab animates its steps, then shown. */
  const advance = useCallback(async (i: number, t: number) => {
    const animate = latest.current.run;
    if (animate) {
      // Drawn at once, so that the places a step moves to are on the page when its animation measures them.
      flushSync(() => setMoving(i));
      await animate(i, latest.current.speed);
      if (token.current !== t) return;
      setMoving(null);
    }
    setPos((p) => (Math.min(p.shown, i) === i ? { shown: i + 1, advanced: i } : p));
  }, []);

  useEffect(() => {
    if (status !== 'playing' || movingNow !== null || shown >= count) return;
    const t = ++token.current;
    // The latest timing (a lab may pass a new function each render), without restarting the wait for it.
    const wait = latest.current.stepMs;
    const ms = typeof wait === 'function' ? wait(shown) / speed : shown <= floor ? 250 : wait / speed;
    let started = false;
    const timer = window.setTimeout(() => {
      started = true;
      void advance(shown, t);
    }, ms);
    // A step that has begun runs to its end (a pause stops after it); one still waiting is called off.
    return () => {
      if (!started) window.clearTimeout(timer);
    };
  }, [status, movingNow, shown, count, floor, speed, advance]);

  const jump = (n: number, then: PlaybackStatus) => {
    token.current++;
    setMoving(null);
    setPos({ shown: Math.max(floor, Math.min(n, count)), advanced: null });
    setChosen(then);
  };
  const play = () => {
    if (shown >= count) jump(floor, 'playing');
    else setChosen('playing');
  };
  const pause = () => setChosen('paused');
  const step = () => {
    if (movingNow !== null || shown >= count) return;
    setChosen('paused');
    void advance(shown, ++token.current);
  };
  const back = () => {
    token.current++;
    setMoving(null);
    setChosen('paused');
    setPos((p) => ({ shown: Math.max(Math.min(p.shown, count) - 1, floor), advanced: null }));
  };
  const replay = () => jump(floor, 'playing');
  const seek = (n: number) => jump(n, 'paused');
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      if (status === 'playing') pause();
      else play();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      step();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      back();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      replay();
    }
  };
  return { shown, count, floor, status, moving: movingNow, advanced, speed, setSpeed, play, pause, step, back, replay, seek, onKey };
}
