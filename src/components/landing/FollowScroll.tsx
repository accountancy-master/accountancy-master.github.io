'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { amount } from './figures';

const clamp = (n: number) => Math.min(1, Math.max(0, n));
/** Where a step stands with nothing to go by (the page as built): the first scene, finished. */
const AT_REST = 0.8;

/**
 * Drives "Follow one transaction" from the scroll. The steps are told in words down the page; the board beside them
 * (above them on a phone) is one picture whose every part reads one number, --p: 0 to 5 as the five steps pass a line
 * across the screen (the middle of a wide screen, a little below the board on a phone). A scene's own progress is
 * p minus its number, so each draws itself as its step is read and stays finished until the next one takes over.
 * The figures that count up (`data-count`) and the stamps (`data-stamp`) are set here too, as CSS cannot count.
 *
 * Without motion the board shows each scene finished, one after another, with nothing moving between them.
 */
export function FollowScroll({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const stage = el.querySelector<HTMLElement>('.ft-stage');
    const steps = [...el.querySelectorAll<HTMLElement>('.ft-step')];
    if (!stage || steps.length === 0) return;
    const counts = [...el.querySelectorAll<HTMLElement>('[data-count]')];
    const stamps = [...el.querySelectorAll<HTMLElement>('[data-stamp]')];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wide = window.matchMedia('(min-width: 1024px)');
    let frame = 0;
    let shownStep = -1;
    const written = new Map<HTMLElement, string>();

    const update = () => {
      frame = 0;
      const view = window.innerHeight;
      const line = wide.matches ? view * 0.5 : (() => {
        const bottom = stage.getBoundingClientRect().bottom;
        return bottom + (view - bottom) * 0.3;
      })();
      let p = 0;
      for (const step of steps) {
        const r = step.getBoundingClientRect();
        p += clamp((line - r.top) / Math.max(1, r.height));
      }
      // Without motion: the scene of the step being read, finished.
      if (reduce.matches) p = Math.min(steps.length - 1, Math.floor(p)) + AT_REST;
      stage.style.setProperty('--p', p.toFixed(3));
      const at = Math.min(steps.length - 1, Math.floor(p));
      if (at !== shownStep) {
        shownStep = at;
        stage.dataset.step = String(at);
        steps.forEach((s, i) => s.toggleAttribute('data-active', i === at));
      }
      for (const c of counts) {
        const s = clamp(p - Number(c.dataset.scene));
        const e = clamp((s - Number(c.dataset.a)) / Number(c.dataset.d));
        const text = amount(Math.round(Number(c.dataset.count) * e * e * (3 - 2 * e)));
        if (written.get(c) !== text) {
          written.set(c, text);
          c.textContent = text;
        }
      }
      for (const st of stamps) {
        const s = clamp(p - Number(st.dataset.scene));
        st.classList.toggle('is-on', s >= Number(st.dataset.stamp));
      }
    };
    const ask = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    // Listen to the scroll only while the story is near the screen.
    let listening = false;
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      if (on) {
        window.addEventListener('scroll', ask, { passive: true });
        window.addEventListener('resize', ask);
        ask();
      } else {
        window.removeEventListener('scroll', ask);
        window.removeEventListener('resize', ask);
      }
    };
    // On a phone the words of the step being read stay just under the board: they need its height.
    const sized = new ResizeObserver(() => el.style.setProperty('--ft-stage-h', `${Math.round(stage.offsetHeight)}px`));
    sized.observe(stage);
    const near = new IntersectionObserver(([entry]) => listen(entry.isIntersecting), { rootMargin: '200px 0px' });
    near.observe(el);
    reduce.addEventListener('change', ask);
    update();
    return () => {
      near.disconnect();
      sized.disconnect();
      listen(false);
      reduce.removeEventListener('change', ask);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={root} className="ft" data-testid="follow-story">
      {children}
    </div>
  );
}
