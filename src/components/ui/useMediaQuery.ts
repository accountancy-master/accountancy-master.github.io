'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** The width at which the app has a sidebar and a top bar instead of the phone layout (Tailwind's `lg`). */
export const WIDE_QUERY = '(min-width: 1024px)';

/**
 * Whether a media query matches, following it as the window changes. While a page is prerendered, and in the first
 * render in the browser that must agree with it, it is `fallback`.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}
