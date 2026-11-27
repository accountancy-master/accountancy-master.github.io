'use client';

import { useCallback, useSyncExternalStore } from 'react';

// The ticks of the exam tips' checklists ("Before the exam"), kept on the device in localStorage, one list per course.
// A tip is known by a short hash of its text, so that a tip that is reworded comes back unticked and the others keep
// their ticks whatever order they are in.

/** The localStorage key of the ticks of a course. */
export const ticksKey = (courseId: string): string => `am.examTicks.${courseId}`;

/** A short, stable id for a tip: the FNV-1a hash of its text, in base 36. */
export function tipId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** The ticked ids as they are stored: anything that is not a list of strings counts as nothing ticked. */
export function ticksFromStored(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();
// Kept when the browser refuses to store, so ticking still works until the page is reloaded.
const unsaved = new Map<string, string>();
const NONE = '[]';

function read(key: string): string {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) return raw;
  } catch {
    // Storage blocked: what was ticked in this page.
  }
  return unsaved.get(key) ?? NONE;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith('am.examTicks.')) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** The ticks of a course on this device, and a way to tick or untick a tip. Nothing is ticked before hydration. */
export function useExamTicks(courseId: string): { ticked: ReadonlySet<string>; toggle(id: string): void } {
  const key = ticksKey(courseId);
  // The stored text is the snapshot, so it is the same value from one read to the next while nothing changes.
  const raw = useSyncExternalStore(subscribe, () => read(key), () => NONE);
  const toggle = useCallback(
    (id: string) => {
      const now = new Set(ticksFromStored(read(key)));
      if (now.has(id)) now.delete(id);
      else now.add(id);
      const next = JSON.stringify([...now].sort());
      unsaved.set(key, next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage blocked: the ticks hold until the page is reloaded.
      }
      for (const notify of [...listeners]) notify();
    },
    [key],
  );
  return { ticked: new Set(ticksFromStored(raw)), toggle };
}
