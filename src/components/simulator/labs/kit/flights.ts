'use client';

import { useEffect, useRef, type RefObject } from 'react';

// ---------------------------------------------------------------------------------------------------------------
// Amounts that fly: a chip with the amount (or the words written) rises from where the value comes from and lands
// where it goes, by transform and opacity only. The chips are only a picture: every amount is also in the step's
// words. With reduced motion a lab flies nothing (its picture fades from one state to the next).
// ---------------------------------------------------------------------------------------------------------------

const CHIP =
  'pointer-events-none absolute left-0 top-0 z-20 whitespace-nowrap rounded-full border-2 border-accent-deep bg-accent px-2 py-0.5 text-xs font-extrabold text-ink shadow-card tabular-nums';

/**
 * Flies a chip with `label` from the centre of `from` to the centre of `to`, both inside `root` (which is
 * positioned). The start is kept within the window, so a chip whose source has scrolled away flies in from the
 * edge. Resolves when it has landed, or when its time is up on a page that is not being drawn.
 */
export function flyChip(root: HTMLElement | null, from: Element | null, to: Element | null, label: string, ms: number, delay = 0): Promise<void> {
  if (!root || !from || !to || ms <= 0 || typeof Element === 'undefined' || !('animate' in Element.prototype)) return Promise.resolve();
  const box = root.getBoundingClientRect();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const top = -box.top + 24;
  const bottom = window.innerHeight - box.top - 24;
  const x0 = a.left + a.width / 2 - box.left;
  const y0 = Math.min(Math.max(a.top + a.height / 2 - box.top, top), bottom);
  const x1 = b.left + b.width / 2 - box.left;
  const y1 = b.top + b.height / 2 - box.top;
  const chip = document.createElement('span');
  chip.className = CHIP;
  chip.textContent = label;
  chip.setAttribute('aria-hidden', 'true');
  root.appendChild(chip);
  const at = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
  const lift = Math.min(70, Math.max(Math.abs(x1 - x0) / 4, Math.abs(y1 - y0) / 3) + 24);
  const anim = chip.animate(
    [
      { transform: at(x0, y0, 0.7), opacity: 0 },
      { transform: at(x0, y0, 1), opacity: 1, offset: 0.12 },
      { transform: at((x0 + x1) / 2, Math.min(y0, y1) - lift, 1.05), opacity: 1, offset: 0.55 },
      { transform: at(x1, y1, 1), opacity: 1, offset: 0.9 },
      { transform: at(x1, y1, 0.9), opacity: 0 },
    ],
    { duration: ms, delay, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' },
  );
  const late = new Promise<void>((done) => window.setTimeout(done, delay + ms * 1.5 + 250));
  return Promise.race([anim.finished.then(() => undefined, () => undefined), late]).then(() => chip.remove());
}

/** An amount that flies between two places of a picture, each marked `data-spot="<name>"`. */
export interface Flight {
  from: string;
  to: string;
  /** What the chip says: "₹30,000". */
  text: string;
}

/** Flies the flights at once, a little apart; no more than six, so that a budget phone keeps up. */
export function fly(root: HTMLElement, flights: readonly Flight[], ms: number): Promise<void> {
  const spot = (name: string) => root.querySelector(`[data-spot="${name}"]`);
  return Promise.all(flights.slice(0, 6).map((f, i) => flyChip(root, spot(f.from), spot(f.to), f.text, ms, i * 120))).then(() => undefined);
}

/** Flies the flights of a step each time the walk-through moves forward onto it (`advanced`, see usePlayback). */
export function useFlights(root: RefObject<HTMLElement | null>, advanced: number | null, shown: number, flightsOf: (step: number) => Flight[], reduced: boolean) {
  const latest = useRef(flightsOf);
  useEffect(() => {
    latest.current = flightsOf;
  });
  useEffect(() => {
    if (reduced || advanced === null || advanced !== shown - 1 || !root.current) return;
    void fly(root.current, latest.current(advanced), 1300);
  }, [advanced, shown, reduced, root]);
}

/** Scrolls an element into view if it is not, so that what moves can be seen on a phone. */
export function bringIntoView(el: Element | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'nearest' });
}
