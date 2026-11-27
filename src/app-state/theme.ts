'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { THEME_KEY } from './themeScript';

// The colour theme is a choice of this device, like "unlock all levels": kept in localStorage, never with the learner.
// With no choice made the system's preference is followed (globals.css). The choice is put on <html> as data-theme by
// a script in the page head (THEME_SCRIPT), before anything is painted, so a dark page never flashes white.

export type Theme = 'light' | 'dark';

const CHANGED = 'am-theme-change';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function current(): Theme {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    media.removeEventListener('change', onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** The theme the page is in now, and a way to switch to the other one (which is then kept on this device). */
export function useTheme(): { theme: Theme; toggle(): void } {
  const theme = useSyncExternalStore(subscribe, current, () => 'light' as Theme);
  const toggle = useCallback(() => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: the theme holds until the page is reloaded.
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return { theme, toggle };
}
