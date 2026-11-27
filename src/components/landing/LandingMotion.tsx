'use client';

import { useEffect } from 'react';

/** Marks the page as one where motion is welcome. Run as the page is parsed, so nothing is painted before it. */
const MOTION_SCRIPT = `try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.setAttribute('data-lp-motion','')}catch(e){}`;

/**
 * Motion on the landing page (landing.css): `data-lp-motion` on <html> when the visitor has not asked for reduced
 * motion, and `data-seen` on each part marked `data-reveal` once it has come into view, which plays its drawing in.
 * Without motion nothing is hidden and nothing plays: every part is already drawn in its finished state.
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Arrived by a link inside the app, the script above did not run: the same decision, made now.
    if (!reduce.matches) root.setAttribute('data-lp-motion', '');
    const onChange = () => (reduce.matches ? root.removeAttribute('data-lp-motion') : root.setAttribute('data-lp-motion', ''));
    reduce.addEventListener('change', onChange);

    const parts = document.querySelectorAll<HTMLElement>('.lp [data-reveal]');
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-seen', '');
          seen.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    );
    parts.forEach((p) => seen.observe(p));
    return () => {
      seen.disconnect();
      reduce.removeEventListener('change', onChange);
      root.removeAttribute('data-lp-motion');
    };
  }, []);

  return <script dangerouslySetInnerHTML={{ __html: MOTION_SCRIPT }} />;
}
