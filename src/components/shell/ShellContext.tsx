'use client';

import { createContext, useContext, useEffect, useRef } from 'react';

// What a screen tells the Shell around it: where the learner is (the trail of the top bar), and whether leaving it
// now would cost something (the leave guard). A screen outside a Shell (in a unit test, say) tells nobody, harmlessly.

/** One step of the trail: "Topics", "Goodwill". A step with an address is a link. */
export interface Crumb {
  label: string;
  href?: string;
}

/** Where to go when leaving, and what to do first (change course, switch learner). */
export interface LeaveTarget {
  href: string;
  before?: () => unknown;
}

/**
 * Asked before the learner leaves the screen by the Shell (the sidebar, the top bar, "Go to", the course switch). It
 * returns true when it has asked the learner instead (it then leaves, or not, itself), false to let them go.
 */
export type LeaveGuard = (target: LeaveTarget) => boolean;

export interface ShellApi {
  setTrail(trail: Crumb[] | null): void;
  setGuard(guard: LeaveGuard | null): void;
  /** Leaves for the target, unless the screen's guard asks first. */
  leave(target: LeaveTarget): void;
  /** True while a guard is set. */
  guarded(): boolean;
}

export const ShellContext = createContext<ShellApi | null>(null);

/** Names where the learner is, for the top bar: the steps after the course, the last being the page's title. */
export function useShellTrail(trail: Crumb[] | null): void {
  const shell = useContext(ShellContext);
  // Compared by what it says, so that a screen may hand in a new list on every render.
  const key = trail ? JSON.stringify(trail) : '';
  useEffect(() => {
    if (!shell) return;
    shell.setTrail(key ? (JSON.parse(key) as Crumb[]) : null);
    return () => shell.setTrail(null);
  }, [shell, key]);
}

/**
 * Asks the screen before the learner leaves it by the Shell. `guard` may change on every render: the newest one is
 * asked. Pass null when leaving costs nothing.
 */
export function useLeaveGuard(guard: LeaveGuard | null): void {
  const shell = useContext(ShellContext);
  const latest = useRef(guard);
  const on = guard !== null;
  useEffect(() => {
    latest.current = guard;
  });
  useEffect(() => {
    if (!shell || !on) return;
    shell.setGuard((target) => latest.current?.(target) ?? false);
    return () => shell.setGuard(null);
  }, [shell, on]);
}

/** Leaves for a target through the Shell (asking the screen first), or straight away outside one. */
export function useLeave(): (target: LeaveTarget, fallback: (target: LeaveTarget) => void) => void {
  const shell = useContext(ShellContext);
  return (target, fallback) => (shell ? shell.leave(target) : fallback(target));
}
