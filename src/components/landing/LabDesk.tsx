'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Seconds a card takes to drift past. */
const SECONDS_A_CARD = 6;

/**
 * The strip of ledger paper the labs drift past on. It holds the cards twice (the second set hidden from assistive
 * technology and from the keyboard), so that it can drift without end. It stops while the pointer is over it, and it
 * can be paused. The moment a visitor reaches into it (a key that moves focus to a card, a touch, a sideways scroll),
 * it stops drifting and becomes a strip to scroll by hand, from where it stood; Play sets it drifting again. Without
 * motion it is a strip to scroll by hand from the start.
 */
export function LabDesk({ cards, children }: { cards: number; children: ReactNode }) {
  const desk = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState(false);
  const duration = cards * SECONDS_A_CARD;

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const decide = () => setMotion(!reduce.matches);
    decide();
    reduce.addEventListener('change', decide);
    return () => reduce.removeEventListener('change', decide);
  }, []);

  // By hand from here: the strip keeps the place it had drifted to.
  const takeOver = () => {
    const d = desk.current;
    const t = track.current;
    if (!d || !t || manual) return;
    const shift = new DOMMatrixReadOnly(getComputedStyle(t).transform).m41;
    d.setAttribute('data-manual', '');
    d.scrollLeft = -shift;
    setManual(true);
  };

  const play = () => {
    const d = desk.current;
    const t = track.current;
    if (!d || !t) return;
    if (manual) {
      // Drift on from where the hand left it.
      const half = t.scrollWidth / 2;
      const at = half > 0 ? (d.scrollLeft % half) / half : 0;
      t.style.animationDelay = `${-at * duration}s`;
      d.scrollLeft = 0;
      d.removeAttribute('data-manual');
      setManual(false);
    }
    setPaused(false);
  };

  const still = !motion || paused || manual;

  return (
    <>
      {motion ? (
        <div className="lp-wrap lp-desk-ctl">
        <button
          type="button"
          className="lp-btn lp-btn-ghost lp-btn-sm"
          data-testid="labs-pause"
          onClick={() => (still ? play() : setPaused(true))}
        >
          {still ? 'Let the labs drift' : 'Stop the labs drifting'}
        </button>
        </div>
      ) : null}
      <div
        ref={desk}
        className="lp-desk"
        data-testid="lab-desk"
        data-paused={paused ? '' : undefined}
        style={{ ['--lp-drift' as string]: `${duration}s` }}
        onFocus={(e) => {
          takeOver();
          (e.target as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'center' });
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') takeOver();
        }}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) takeOver();
        }}
      >
        <div ref={track} className="lp-track">
          {children}
        </div>
      </div>
    </>
  );
}
