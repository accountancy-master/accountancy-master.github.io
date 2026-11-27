'use client';

import { useEffect, useRef, useState } from 'react';
import { amount } from './figures';

export interface TapeLine {
  /** The part of the page (its `data-tape`) whose arrival prints the line. */
  part: string;
  label: string;
  n: number;
}

/**
 * The adding-machine tape at the side of the page: as each part of the page is reached it prints that part's
 * figures ("Labs 19 +"), and the machine shows the running total and, on its gauge, how far down the page the
 * visitor has come. At the last part the tape is torn off: the slip there (Landing.tsx) carries the total. On a
 * narrow screen it is a slim strip down the edge that unrolls as the page is read, with the line just printed shown
 * beside it for a moment. It is a picture of what the page already says in words, so it is hidden from assistive
 * technology.
 */
export function AddingTape({ lines, tearAt }: { lines: readonly TapeLine[]; tearAt: string }) {
  const tape = useRef<HTMLDivElement>(null);
  const [printed, setPrinted] = useState(0);
  const [torn, setTorn] = useState(false);
  const [chit, setChit] = useState(false);

  useEffect(() => {
    const el = tape.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      el.style.setProperty('--lp-read', String(room > 0 ? Math.min(1, Math.max(0, window.scrollY / room)) : 0));
    };
    const ask = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', ask, { passive: true });
    window.addEventListener('resize', ask);

    // The line just printed is shown beside the strip of a narrow screen for a moment.
    let most = 0;
    let hide = 0;
    const printTo = (count: number) => {
      if (count <= most) return;
      most = count;
      setPrinted(count);
      setChit(true);
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setChit(false), 1800);
    };

    const parts = [...document.querySelectorAll<HTMLElement>('.lp [data-tape]')];
    const order = parts.map((p) => p.dataset.tape ?? '');
    const reached = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const part = (entry.target as HTMLElement).dataset.tape ?? '';
          if (part === tearAt) setTorn(entry.isIntersecting);
          if (!entry.isIntersecting) continue;
          // Everything up to this part is printed: a jump down the page prints what it passed.
          const upTo = order.indexOf(part);
          const count = lines.filter((l) => order.indexOf(l.part) <= upTo && order.indexOf(l.part) !== -1).length;
          printTo(count);
        }
      },
      { rootMargin: '0px 0px -35% 0px', threshold: 0 },
    );
    parts.forEach((p) => reached.observe(p));
    return () => {
      window.clearTimeout(hide);
      reached.disconnect();
      window.removeEventListener('scroll', ask);
      window.removeEventListener('resize', ask);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [lines, tearAt]);

  const shown = lines.slice(0, printed);
  const running = shown.reduce((n, l) => n + l.n, 0);
  const last = shown.at(-1);

  return (
    <div ref={tape} className="lp-tape" aria-hidden="true" data-testid="adding-tape" data-printed={printed} data-torn={torn ? '' : undefined}>
      <div className="lp-tape-paper">
        <div key={printed} className="lp-tape-lines lp-tape-feed">
          {shown.map((l) => (
            <div key={l.label} className="lp-tape-line">
              <span className="lp-tape-label">{l.label}</span>
              <span className="lp-tape-num">{amount(l.n)}</span>
              <span className="lp-tape-sym">+</span>
            </div>
          ))}
        </div>
      </div>
      <div className="lp-tape-machine">
        <span className="lp-tape-display">{amount(running)}</span>
        <span className="lp-tape-gauge">
          <span />
        </span>
      </div>
      {last ? (
        <span className="lp-tape-chit" data-show={chit ? '' : undefined}>
          + {amount(last.n)} {last.label.toLowerCase()} · {amount(running)}
        </span>
      ) : null}
    </div>
  );
}
