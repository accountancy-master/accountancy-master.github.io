'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { marksFromStored, type VivaMark } from '@/content/practical/viva';

// The marks a learner gives the viva questions they practise ("I knew it", "Not yet"), kept on the device in
// localStorage, one list per learner and course, as the ticks of the exam tips are kept (examTicks.ts). Nothing here
// is scored: it only decides the order of the next practice.

/** The localStorage key of the marks of a learner in a course. */
export const vivaKey = (profileId: string, courseId: string): string => `am.viva.${profileId}.${courseId}`;

const listeners = new Set<() => void>();
// Kept when the browser refuses to store, so marking still works until the page is reloaded.
const unsaved = new Map<string, string>();
const NONE = '{}';

function read(key: string): string {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) return raw;
  } catch {
    // Storage blocked: what was marked in this page.
  }
  return unsaved.get(key) ?? NONE;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith('am.viva.')) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** The marks of a learner in a course on this device, and a way to mark a question. Nothing is marked before hydration. */
export function useVivaMarks(profileId: string, courseId: string): { marks: Readonly<Record<string, VivaMark>>; mark(id: string, mark: VivaMark['mark']): void; clear(): void } {
  const key = vivaKey(profileId, courseId);
  const raw = useSyncExternalStore(subscribe, () => read(key), () => NONE);
  const write = useCallback(
    (next: string) => {
      unsaved.set(key, next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage blocked: the marks hold until the page is reloaded.
      }
      for (const notify of [...listeners]) notify();
    },
    [key],
  );
  const mark = useCallback(
    (id: string, m: VivaMark['mark']) => {
      const now = marksFromStored(read(key));
      now[id] = { mark: m, at: Date.now() };
      write(JSON.stringify(now));
    },
    [key, write],
  );
  const clear = useCallback(() => write(NONE), [write]);
  return { marks: marksFromStored(raw), mark, clear };
}
