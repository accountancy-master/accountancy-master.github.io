'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  MARATHON_SUBTOPICS_KEY,
  subtopicChoicesFromStored,
  subtopicChoicesToStored,
  withSubtopicChoice,
  type SubtopicChoices,
} from '@/learning/marathonSubtopics';

// The subtopics left out of a marathon, by topic, kept in localStorage the way the "unlock all levels" setting is
// (see app-state/DeviceSettings.tsx): read after hydration, and every change reaches all subscribers at once, in
// this tab and, through the storage event, in the others.
const listeners = new Set<() => void>();
// Set only when the browser refused to store a choice: it then holds, in place of what is stored, until the page is
// reloaded.
let unsaved: string | null = null;

function readStored(): string | null {
  if (unsaved !== null) return unsaved;
  try {
    return window.localStorage.getItem(MARATHON_SUBTOPICS_KEY);
  } catch {
    // Storage blocked: nothing is remembered.
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === MARATHON_SUBTOPICS_KEY || e.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const serverSnapshot = (): string | null => null;

/** The remembered subtopic choices of this device, and a way to set the subtopics left out of one topic. */
export function useSubtopicChoices(): { choices: SubtopicChoices; setOff(topicId: string, off: readonly string[]): void } {
  const raw = useSyncExternalStore(subscribe, readStored, serverSnapshot);
  const choices = useMemo(() => subtopicChoicesFromStored(raw), [raw]);
  const setOff = useCallback((topicId: string, off: readonly string[]) => {
    const next = subtopicChoicesToStored(withSubtopicChoice(subtopicChoicesFromStored(readStored()), topicId, off));
    try {
      window.localStorage.setItem(MARATHON_SUBTOPICS_KEY, next);
      unsaved = null;
    } catch {
      // Storage blocked or full: the choice holds until the page is reloaded.
      unsaved = next;
    }
    for (const notify of [...listeners]) notify();
  }, []);
  return { choices, setOff };
}
