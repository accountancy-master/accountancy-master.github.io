'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * Something that has just arrived in the picture: it comes in from `from` (a transform) and fades in, by transform
 * and opacity only. With reduced motion it is simply there, at full strength at once: a fade would leave its words
 * faint (too little contrast to read) while it lasted.
 */
export function Arrive({ children, from, reduced, className, style, ms = 700, testId }: { children?: ReactNode; from: string; reduced: boolean; className?: string; style?: CSSProperties; ms?: number; testId?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof el.animate !== 'function') return;
    const frames = [{ transform: from, opacity: 0 }, { transform: from, opacity: 1, offset: 0.15 }, { transform: 'none', opacity: 1 }];
    const anim = el.animate(frames, { duration: ms, easing: 'cubic-bezier(.3,.7,.3,1)' });
    // A page that is not being drawn does not move its animations on: the thing is shown all the same.
    const late = window.setTimeout(() => anim.finish(), ms + 300);
    return () => {
      window.clearTimeout(late);
      anim.cancel();
    };
  }, [from, reduced, ms]);
  return (
    <span ref={ref} data-testid={testId} className={className} style={style}>
      {children}
    </span>
  );
}

/**
 * Something that leaves the picture: it starts where it is drawn and goes off to `to` (a transform) as it fades out,
 * by transform and opacity only. With reduced motion it only fades, slowly. It stays gone.
 */
export function Leave({ to, reduced, className, style, ms = 900, testId }: { to: string; reduced: boolean; className?: string; style?: CSSProperties; ms?: number; testId?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const frames = reduced ? [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }] : [{ transform: 'none', opacity: 1 }, { transform: 'none', opacity: 1, offset: 0.35 }, { transform: to, opacity: 0 }];
    const duration = reduced ? 1400 : ms;
    const anim = el.animate(frames, { duration, easing: 'cubic-bezier(.5,0,.7,.4)', fill: 'forwards' });
    const late = window.setTimeout(() => anim.finish(), duration + 300);
    return () => {
      window.clearTimeout(late);
      anim.cancel();
    };
  }, [to, reduced, ms]);
  return <span ref={ref} aria-hidden="true" data-testid={testId} className={className} style={style} />;
}
