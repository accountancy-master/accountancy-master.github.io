'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { CONFIG } from '@/learning/config';
import { UNLOCK_ALL_KEY, unlockAllFromStored, unlockAllToStored } from '@/learning/deviceSettings';

export interface DeviceSettings {
  /** True when every level is open and all practice is offered, without passing the earlier levels. */
  unlockAll: boolean;
  setUnlockAll(on: boolean): void;
}

const DeviceSettingsContext = createContext<DeviceSettings | null>(null);

// The stored value is read after hydration (the server snapshot is the default), and every change reaches all
// subscribers at once, in this tab and, through the storage event, in the others.
const listeners = new Set<() => void>();
// Kept when the browser refuses to store the value, so the switch still works until the page is reloaded.
let unsaved: boolean | null = null;

function readUnlockAll(): boolean {
  try {
    const raw = window.localStorage.getItem(UNLOCK_ALL_KEY);
    if (raw !== null) return unlockAllFromStored(raw);
  } catch {
    // Storage blocked: fall through to what was set in this page, then the default.
  }
  return unsaved ?? CONFIG.ladder.unlockAllByDefault;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === UNLOCK_ALL_KEY || e.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const serverSnapshot = (): boolean => CONFIG.ladder.unlockAllByDefault;

/** Device-level settings, kept in localStorage. Mounted once in the root layout. */
export function DeviceSettingsProvider({ children }: { children: ReactNode }) {
  const unlockAll = useSyncExternalStore(subscribe, readUnlockAll, serverSnapshot);
  const setUnlockAll = useCallback((on: boolean) => {
    unsaved = on;
    try {
      window.localStorage.setItem(UNLOCK_ALL_KEY, unlockAllToStored(on));
    } catch {
      // Storage blocked: the choice holds until the page is reloaded.
    }
    for (const notify of [...listeners]) notify();
  }, []);
  const value = useMemo(() => ({ unlockAll, setUnlockAll }), [unlockAll, setUnlockAll]);
  return <DeviceSettingsContext.Provider value={value}>{children}</DeviceSettingsContext.Provider>;
}

export function useDeviceSettings(): DeviceSettings {
  const ctx = useContext(DeviceSettingsContext);
  if (!ctx) throw new Error('useDeviceSettings must be used inside DeviceSettingsProvider');
  return ctx;
}
